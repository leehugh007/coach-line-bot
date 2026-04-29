/**
 * LINE Webhook — 休校長小幫手
 *
 * v4：訊息合併 + AI 意圖分類知識注入
 *
 * 流程：
 * 1. 驗證簽名，回覆 HTTP 200
 * 2. 群組文字訊息 → 偵測自介 → 背景存入用戶檔案（不回覆）
 * 3. 私訊文字訊息 → buffer 合併（8秒窗口）→ 載入用戶資料 → AI 回覆 → 背景存標籤
 * 4. 非文字訊息 → 友善提示（僅私訊）
 */

import { FOOD_QUIZZES, QUIZ_LEVELS as QUIZ_LEVELS_DATA } from '@/lib/quiz-data';
import { KNOWLEDGE_QUIZZES, KNOWLEDGE_LEVELS } from '@/lib/knowledge-quiz-data';
import { verifySignature, sendMessage, pushMessage, replyWithQuickReply, getProfile, getGroupMemberProfile, getGroupSummary } from '@/lib/line';
import { handleMessage, basicMessageFilter, aiDetectQuestion, generateDraftResponse, generateAchievementDraftResponse } from '@/lib/ai';
import { getChatHistory, addChatMessage, formatChatForGemini, addGroupMessage, getGroupContext } from '@/lib/chat';
import { classifyIntent } from '@/lib/knowledge';
import { savePendingItem } from '@/lib/pending';
import { bufferMessage, isBufferReady, consumeBuffer, BATCH_DELAY, TEXT_EXTRA_DELAY } from '@/lib/queue';
import {
  looksLikeIntroduction, processIntroduction,
  getUser, recordInteraction, buildUserContext, getClassStatus,
  tryMatchPreloaded, isLinNameDuplicate, setPendingVerify,
  getPendingVerify, clearPendingVerify, tryMatchByRealName,
  setPendingClassSelect, getPendingClassSelect, clearPendingClassSelect,
  getActiveClassNames, getActiveGoal, setGoal, completeGoal,
  recordStreak, getStreak, getClassStats, isFirstInteractionToday,
  updateRenewalIntent,
} from '@/lib/user';
import {
  extractCoachingTags, saveCoachingTags,
  checkMilestones, getTopicCount, getRecentTopics,
} from '@/lib/tags';
import { NextResponse } from 'next/server';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export const maxDuration = 120;

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get('x-line-signature');

  if (!signature || !verifySignature(body, signature)) {
    console.error('Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { events } = JSON.parse(body);
  if (!events || events.length === 0) {
    return NextResponse.json({ ok: true });
  }

  // [2026-03-27] 群組功能暫時關閉，問題偵測邏輯待重新討論
  // LINE 快速通知：掃描群組訊息關鍵字 → 通知教練+助教
  // const mindsetWords = ['放棄','不想','算了','崩潰','撐不下去','做不到','好累','沒用','沒效','受不了','暴食','好想吃','管不住','復胖','不敢量','不想量'];
  // const notifyTargets = [process.env.COACH_USER_ID, process.env.STAFF_USER_ID].filter(Boolean);
  // ... (群組快速通知已暫停)

  const processPromises = events.map(event => processEvent(event));

  if (globalThis.__nextWaitUntil) {
    globalThis.__nextWaitUntil(Promise.all(processPromises));
  } else {
    await Promise.all(processPromises);
  }

  return NextResponse.json({ ok: true });
}

async function processEvent(event) {
  try {
    const { type, replyToken, source } = event;
    const userId = source?.userId;
    const sourceType = source?.type; // 'user' (私訊), 'group', 'room'

    // 加好友
    if (type === 'follow') {
      return await handleFollow(replyToken, userId);
    }

    // 學員退出群組 → 清除班級（不再收課程推播，但仍可用小幫手基本功能）
    if (type === 'memberLeft') {
      const leftMembers = event.left?.members || [];
      for (const member of leftMembers) {
        if (member.userId) {
          try {
            const { getSupabase } = await import('@/lib/supabase');
            const sb = getSupabase();
            if (sb) {
              await sb.from('users').update({ class_name: null }).eq('id', member.userId);
            }
            console.log(`[Left] ${member.userId?.substring(0, 8)} left group, class_name cleared`);
          } catch (e) { console.error('[Left] Error:', e); }
        }
      }
      return;
    }

    if (type !== 'message') return;

    const { message } = event;

    // ===== 群組訊息處理 =====
    if ((sourceType === 'group' || sourceType === 'room')) {
      if (message.type === 'text') {
        return await handleGroupMessage(event.source, userId, message.text, message.mention);
      }
      return; // 非文字（貼圖/圖片等）靜默忽略，不掉到下面 catch-all
    }

    // ===== 私訊：buffer 合併後 AI 回覆 =====
    if (message.type === 'text') {
      return await bufferAndSchedule(replyToken, userId, message.text);
    }

    // 圖片：set Redis flag，60 秒內若有文字訊息進來，AI 會收到「用戶剛傳圖片」marker
    // 避免 AI 拿到 chat history 裡的「這是圖片」字串就腦補假裝看到（Shair 事件 2026-04-28）
    if (message.type === 'image') {
      try {
        const { Redis } = await import('@upstash/redis');
        const _rImg = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
        await _rImg.set(`coach-image-pending:${userId}`, '1', { ex: 60 });
        console.log(`[ImageMarker] ${userId?.substring(0, 8)}: image flag set (60s)`);
      } catch (e) {
        console.error('[ImageMarker] set error:', e.message);
      }
    }

    // 其他類型（圖片/貼圖/影片/檔案等都走這裡）
    return await sendMessage(replyToken, userId,
      '嗨！我是休校長小幫手，目前主要用文字跟你聊天。有什麼心態上的問題或飲食上的困擾，都可以直接打字跟我說！'
    );

  } catch (err) {
    console.error('Event error:', err);
  }
}

// ===== 群組訊息處理：靜默偵測自介 =====

async function handleGroupMessage(source, userId, text, mention) {
  const trimmed = text.trim();
  const groupId = source.groupId || source.roomId;

  // 0. 取得發言者名稱（用於 buffer 和通知）
  let displayName = '未知';
  try {
    const profile = groupId
      ? await getGroupMemberProfile(groupId, userId)
      : await getProfile(userId);
    if (profile?.displayName) displayName = profile.displayName;
  } catch (e) { /* ignore */ }

  // 1. 每則訊息都存入群組 buffer（不管是不是問題，都是上下文）
  await addGroupMessage(groupId, userId, displayName, trimmed);

  // 1.5 記錄學員最後群組活動時間（用於智慧推播判斷）
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    if (sb) {
      await sb.from('users').update({ last_group_activity: new Date().toISOString() }).eq('id', userId);
    }
  } catch (e) { /* 不阻塞主流程 */ }

  // 1.7 偵測班長/助教點名 → 自動推播關心訊息給被點名的人
  // 點名情境：沒上傳飲食、鼓勵發言、鼓勵分享、鼓勵互動等
  const mentionees = mention?.mentionees?.filter(m => m.userId) || [];
  const rollCallKeywords = ['點名', '上傳', '餐點', '分享', '飲食', '還沒看到', '沒有看到', '跟上', '加油'];
  const hasRollCallHint = rollCallKeywords.some(kw => trimmed.includes(kw));

  if (mentionees.length >= 3 && hasRollCallHint) {
    // @ 了 3 人以上 + 有點名相關關鍵字 = 很可能是點名
    console.log(`[RollCall] Detected! ${displayName} tagged ${mentionees.length} students`);

    const rollCallPush = async () => {
      // 根據點名內容決定推播語氣
      const isAboutUpload = ['上傳', '餐點', '飲食', '還沒看到', '沒有看到'].some(kw => trimmed.includes(kw));

      const uploadCareMessages = [
        (name) => `${name}，最近還好嗎？如果外食不知道怎麼選，按下面選單的「下一餐吃什麼」，跟我說你在哪吃，我幫你想搭配 😊`,
        (name) => `${name}，最近有遇到什麼困難嗎？不管是飲食上的還是心態上的，都可以跟我聊。我們一起想辦法 ☺️`,
        (name) => `${name}，分享一個小撇步：自助餐三格配菜都選蔬菜才剛好一餐的量。聽起來很多？試了就知道很快吃完 😄\n\n有問題隨時問我！`,
      ];

      const encourageMessages = [
        (name) => `${name}，最近在課程中有沒有什麼新發現？不管大小都可以跟我分享 ☺️`,
        (name) => `${name}，課程到現在，有沒有什麼食物搭配是你覺得蠻順手的？跟我說說看 😊`,
        (name) => `${name}，最近有什麼飲食或心態上的問題嗎？什麼都可以問我，不用客氣 ☺️`,
      ];

      const messages = isAboutUpload ? uploadCareMessages : encourageMessages;

      for (const m of mentionees) {
        try {
          // 不推播給發言者自己（班長/助教）和教練
          if (m.userId === userId || m.userId === process.env.COACH_USER_ID) continue;

          const msgFn = messages[Math.floor(Math.random() * messages.length)];
          let studentName = '同學';
          try {
            const profile = await getGroupMemberProfile(groupId, m.userId);
            if (profile?.displayName) studentName = profile.displayName;
          } catch (_) {}

          await pushMessage(m.userId, msgFn(studentName));
          console.log(`[RollCall] Pushed to ${studentName} (${isAboutUpload ? 'upload' : 'encourage'})`);
        } catch (err) {
          console.error(`[RollCall] Push failed for ${m.userId}:`, err.message);
        }
      }
    };

    if (globalThis.__nextWaitUntil) {
      globalThis.__nextWaitUntil(rollCallPush());
    } else {
      rollCallPush().catch(err => console.error('[RollCall] Error:', err));
    }
  }

  // 2. 偵測自我介紹（存入用戶資料 + 通知教練產草稿）
  if (looksLikeIntroduction(trimmed)) {
    console.log(`[Group] Self-intro detected from ${displayName} in group ${groupId?.substring(0, 8)}`);

    const introBackground = async () => {
      // 2a. 存個人資料
      try {
        await processIntroduction(userId, trimmed);
        const user = await getUser(userId);
        if (user) {
          user.lineDisplayName = displayName;
          const { saveUser } = await import('@/lib/user');
          await saveUser(userId, user);
        }
      } catch (err) {
        console.error('[Group] Intro processing error:', err);
      }

      // 2b. 通知教練：產草稿 + 送 pending + push 通知
      try {
        let groupName = '';
        try {
          const summary = await getGroupSummary(groupId);
          if (summary?.groupName) groupName = summary.groupName;
        } catch (_) {}
        const groupLabel = groupName ? `【${groupName}】` : '';

        const draft = await generateDraftResponse(trimmed, '', userId, []);
        if (draft) {
          await savePendingItem({
            groupId,
            groupName: groupLabel,
            userId,
            studentName: displayName,
            message: trimmed,
            topic: 'self_intro',
            draft,
          });

          const notifyTargets = [process.env.COACH_USER_ID, process.env.STAFF_USER_ID].filter(Boolean);
          const notifyMsg = `${groupLabel} 🟢 新學員自我介紹\n學員：${displayName}\n\n後台有草稿，可以去複製回覆 ☺️`;
          await Promise.all(notifyTargets.map(id => pushMessage(id, notifyMsg).catch(() => {})));
        }
      } catch (err) {
        console.error('[Group] Intro notify error:', err);
      }
    };

    if (globalThis.__nextWaitUntil) {
      globalThis.__nextWaitUntil(introBackground());
    } else {
      introBackground().catch(err => console.error('[Group] Intro bg error:', err));
    }
    return;
  }

  // 2.5 排除工作人員 — 他們是回答者不是提問者
  const staffIds = [process.env.COACH_USER_ID, process.env.STAFF_USER_ID].filter(Boolean);
  if (staffIds.includes(userId)) {
    console.log(`[Group] Staff (ID) ${displayName}, skip`);
    return;
  }
  // displayName 比對排除工作人員（不依賴 DB）
  const staffNames = ['Susan', 'Uzzi', '楊子緣', '彥綺', 'chao', 'jie', '黃湘儒', 'Mandy', '凜', 'Evelyn', '何啟維', '郁淳', '營養師', '助教', '教練'];
  if (staffNames.some(kw => displayName.includes(kw))) {
    console.log(`[Group] Staff (name: ${displayName}), skip`);
    return;
  }
  // 查 Supabase role 排除其他未標記的工作人員
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    if (sb) {
      const { data } = await sb.from('users').select('role').eq('id', userId).single();
      if (data?.role && data.role !== 'student') {
        console.log(`[Group] Staff (role: ${data.role}) ${displayName}, skip`);
        return;
      }
    }
  } catch (_) { /* 不阻塞 */ }

  // 3. 基本篩選：排除明顯不是問題的短訊息
  if (!basicMessageFilter(trimmed)) return;

  // 4. AI 判斷：帶上群組上下文（無冷卻，有問題就通知）
  const groupContext = await getGroupContext(groupId);
  // 排除當前這則（剛剛才存進去的最後一則）
  const contextForDetect = groupContext.slice(0, -1);
  const detection = await aiDetectQuestion(trimmed, contextForDetect, userId);
  if (!detection || (!detection.isQuestion && !detection.isAchievement)) return;

  const confidence = detection.confidence || 0;
  const isAchievement = detection.isAchievement || false;
  console.log(`[Group] ${displayName}: q=${detection.isQuestion}, ach=${isAchievement}, topic=${detection.topic}, conf=${confidence}`);

  // 問題需 confidence >= 0.8 才通知；心得不設門檻
  if (detection.isQuestion && !isAchievement && confidence < 0.8) {
    console.log(`[Group-Q] ${displayName} confidence ${confidence} < 0.8, skip`);
    return;
  }

  try {
    // 取得學員背景（問題草稿和心得草稿共用）
    let studentContext = '';
    const user = await getUser(userId);
    if (user) {
      const { buildUserContext } = await import('@/lib/user');
      const tags = await getRecentTopics(userId, 15);
      const { getActiveGoal } = await import('@/lib/user');
      const goal = await getActiveGoal(userId);
      studentContext = buildUserContext(user, tags, null, goal);
    }

    // 取得群組名稱（用於後台顯示班別）
    let groupName = '';
    try {
      const summary = await getGroupSummary(groupId);
      if (summary?.groupName) groupName = summary.groupName;
    } catch (e) { /* ignore */ }

    const groupLabel = groupName ? `【${groupName}】` : '';

    // === 問題處理 ===
    if (detection.isQuestion && confidence >= 0.8) {
      const topic = detection.topic || 'other';
      const draft = await generateDraftResponse(trimmed, studentContext, userId, groupContext);
      if (!draft) {
        console.log('[Group-Q] Draft generation failed, skipping');
      } else {
        await savePendingItem({ groupId, groupName, userId, studentName: displayName, message: trimmed, topic, confidence, draft });

        const topicMap = { mindset: '心態', diet: '飲食', plateau: '體重停滯', emotion: '情緒', other: '問題' };
        const confidenceLabel = confidence >= 0.8 ? '🔴' : confidence >= 0.6 ? '🟡' : '⚪';
        const notifyText = `${confidenceLabel}${groupLabel} ${displayName} 提了${topicMap[topic] || ''}問題（信心 ${Math.round(confidence * 100)}%），草稿已備好。`;

        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        const tgChat = process.env.TELEGRAM_CHAT_ID;
        if (tgToken && tgChat) {
          try {
            await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: tgChat,
                text: `${notifyText}\n\n學員說：\n「${trimmed?.substring(0, 200)}」\n\n→ 查看後台：https://coach-line-bot.vercel.app/admin`,
              }),
            });
          } catch (e) { console.error('[Group-Q] Telegram notify error:', e); }
        } else {
          const coachId = process.env.COACH_USER_ID;
          if (coachId) {
            try {
              await pushMessage(coachId, `${notifyText}\n到後台查看：https://coach-line-bot.vercel.app/admin`);
            } catch (e) { console.error('[Group-Q] LINE Push notify error:', e); }
          }
        }
        console.log(`[Group-Q] Pending item saved: ${displayName} (${topic}, ${Math.round(confidence * 100)}%)`);
      }
    }

    // === 心得分享處理 ===
    if (isAchievement) {
      const draft = await generateAchievementDraftResponse(trimmed, studentContext, userId, groupContext);
      if (!draft) {
        console.log('[Group-A] Achievement draft generation failed, skipping');
      } else {
        await savePendingItem({ groupId, groupName, userId, studentName: displayName, message: trimmed, topic: 'achievement', confidence: 1, draft });

        const notifyText = `🎉${groupLabel} ${displayName} 在分享心得，好時機回覆！草稿已備好。`;

        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        const tgChat = process.env.TELEGRAM_CHAT_ID;
        if (tgToken && tgChat) {
          try {
            await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: tgChat,
                text: `${notifyText}\n\n學員說：\n「${trimmed?.substring(0, 200)}」\n\n→ 查看後台：https://coach-line-bot.vercel.app/admin`,
              }),
            });
          } catch (e) { console.error('[Group-A] Telegram notify error:', e); }
        } else {
          const coachId = process.env.COACH_USER_ID;
          if (coachId) {
            try {
              await pushMessage(coachId, `${notifyText}\n到後台查看：https://coach-line-bot.vercel.app/admin`);
            } catch (e) { console.error('[Group-A] LINE Push notify error:', e); }
          }
        }
        console.log(`[Group-A] Achievement pending item saved: ${displayName}`);
      }
    }
  } catch (err) {
    console.error('[Group] Processing error:', err);
  }
}

// ===== 加好友處理 =====

async function handleFollow(replyToken, userId) {
  console.log('[Follow] New user:', userId?.substring(0, 8));

  // 取得目前進行中的班級
  let activeClasses = [];
  try {
    activeClasses = await getActiveClassNames();
  } catch (e) { console.error('[Follow] getActiveClasses error:', e); }

  // 取得 LINE 顯示名稱
  let displayName = '';
  try {
    const profile = await getProfile(userId);
    if (profile?.displayName) displayName = profile.displayName;
  } catch (_) {}

  // 加好友就建 Supabase 紀錄（不管有沒有對話，學員管理頁都看得到）
  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    if (sb) {
      await sb.from('users').upsert({
        id: userId,
        display_name: displayName || null,
        join_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id', ignoreDuplicates: true });
      console.log(`[Follow] Supabase record created for ${displayName || userId?.substring(0, 8)}`);
    }
  } catch (e) { console.error('[Follow] Supabase create error:', e); }

  if (activeClasses.length > 0) {
    // 有進行中的班級 → 先問是哪一班
    await setPendingClassSelect(userId, displayName);

    const quickReply = activeClasses.map(c => ({ label: c, text: c }));
    quickReply.push({ label: '我不是課程學員', text: '我不是課程學員' });

    await replyWithQuickReply(
      replyToken,
      `嗨！我是休校長的小幫手 🙌\n\n歡迎加入！請先告訴我你是哪一班的：`,
      quickReply,
    );
    console.log(`[Follow] Asking class selection for ${displayName || userId?.substring(0, 8)}`);
  } else {
    // 沒有進行中的班 → 直接歡迎
    await sendMessage(replyToken, userId,
      `嗨！我是休校長的小幫手 🙌\n\n不知道下一餐怎麼搭？跟我說你平常在哪裡買（便利商店？自助餐？早餐店？），我幫你想幾個 ABC 搭配，直接照著買就好 😊\n\n「這個能不能吃？」「玉米算澱粉嗎？」這種小問題也可以直接問我，秒回你。\n\n課程中有任何問題也隨時來聊——不好意思在群組問的、心態有點卡的，這裡什麼都可以聊。休校長也看得到喔 ☺️`
    );
  }
}

// ===== 私訊文字處理：buffer → 合併 → 處理 =====

/**
 * 將訊息存入 buffer，排程延遲處理
 * 多條連續訊息會被合併成一則，一起送進 AI
 */
async function bufferAndSchedule(replyToken, userId, text) {
  const trimmed = text.trim();

  // 即時指令：不走 buffer，直接回覆
  const lower = trimmed.toLowerCase();
  if (['你好', 'hi', 'hello', '嗨', '哈囉'].includes(lower)) {
    return await sendMessage(replyToken, userId,
      '你好！我是休校長小幫手，有什麼想聊的嗎？不管是心態上的卡關還是飲食上的疑問，都可以跟我說！'
    );
  }
  if (['我的id', '我的ID', 'myid', 'my id'].includes(lower)) {
    return await sendMessage(replyToken, userId, `你的 userId：\n${userId}`);
  }
  // /reset — 教練專用：清除自己的 Redis + Supabase 資料
  if (trimmed === '/reset' && userId === process.env.COACH_USER_ID) {
    try {
      const { Redis } = await import('@upstash/redis');
      const r = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
      const keys = [
        `coach-user:${userId}`,
        `coach-chat:${userId}`,
        `coach:${userId}:topics`,
        `coach:${userId}:milestones`,
        `coach:${userId}:summary`,
        `coach:${userId}:journey`,
      ];
      await Promise.all(keys.map(k => r.del(k)));

      // 也清 Supabase
      const { getSupabase } = await import('@/lib/supabase');
      const sb = getSupabase();
      if (sb) {
        await Promise.all([
          sb.from('conversations').delete().eq('user_id', userId),
          sb.from('coaching_tags').delete().eq('user_id', userId),
          sb.from('milestones').delete().eq('user_id', userId),
          sb.from('users').delete().eq('id', userId),
        ]);
      }

      console.log(`[Reset] Cleared all data for ${userId?.substring(0, 8)}`);
      return await sendMessage(replyToken, userId, '已清除你的所有資料（Redis + Supabase）。你現在是全新的狀態，可以重新自我介紹。');
    } catch (err) {
      console.error('[Reset] Error:', err);
      return await sendMessage(replyToken, userId, `清除失敗：${err.message}`);
    }
  }

  // === 續報推播回覆：框定內容，不走 AI ===
  // 契約_續報記錄.md §5 T2 — QR 點選 → 寫 renewal_intent + 降級豁免 cooldown push
  const renewalReply = getRenewalQRResponse(trimmed);
  if (renewalReply) {
    console.log(`[Renewal] ${userId?.substring(0, 8)}: "${trimmed}"`);
    // 1. sendMessage（既有）
    await sendMessage(replyToken, userId, renewalReply.reply);

    // 2-6. 寫 intent + 降級判定 + cooldown push（只有有 renewal_intent 且 notifyCoach 的 5 選項進）
    if (renewalReply.renewal_intent && renewalReply.notifyCoach) {
      try {
        // 2. 讀 user profile（既有邏輯 + 取 oldIntent、className）
        const u = await getUser(userId);
        const studentName = u?.info?.name || u?.lineDisplayName || userId?.substring(0, 8) || '同學';
        const oldIntent = u?.renewalIntent || null;
        const className = u?.class_name || u?.className || null;
        const newIntent = renewalReply.renewal_intent;

        // 3. classStatus gate — 有班級才寫（非學員不寫；即使 expired/grace 也允許）
        const classStatus = className ? await getClassStatus(className) : null;
        if (!classStatus) {
          console.log(`[Renewal T2] ${userId?.substring(0, 8)} no class, skip write`);
          return;
        }

        // 4. Supabase 寫入 + Redis profile 同步
        await updateRenewalIntent(userId, {
          intent: newIntent,
          at: new Date(),
          source: 'qr_renewal',
        });

        // 5. 算降級（新值序號 < 舊值序號 = 降級，豁免 cooldown）
        const isDowngrade = oldIntent
          && INTENT_RANK[newIntent] !== undefined
          && INTENT_RANK[oldIntent] !== undefined
          && INTENT_RANK[newIntent] < INTENT_RANK[oldIntent];

        // 6. Cooldown 判定 — 48hr；降級豁免
        const { Redis: _RedisCd } = await import('@upstash/redis');
        const _rCd = new _RedisCd({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
        const cdKey = `coach-renewal-notify-cd:${userId}`;
        const cdHit = await _rCd.get(cdKey);

        if (!cdHit || isDowngrade) {
          notifyRenewalInterest(
            studentName,
            newIntent,
            trimmed,
            isDowngrade ? oldIntent : null
          ).catch(err => console.error('[Renewal] Notify error:', err));
          await _rCd.set(cdKey, new Date().toISOString(), { ex: 172800 });
          console.log(`[Renewal T2] ${userId?.substring(0, 8)} intent=${newIntent} ${isDowngrade ? '(DOWNGRADE push)' : '(push)'}`);
        } else {
          console.log(`[Renewal T2] ${userId?.substring(0, 8)} intent=${newIntent} cooldown hit, skip push`);
        }
      } catch (err) {
        console.error('[Renewal T2] error:', err);
      }
    }
    return;
  }

  // === 班別選擇：加好友後選班 ===
  const pendingClass = await getPendingClassSelect(userId);
  if (pendingClass) {
    const activeClasses = await getActiveClassNames();

    if (activeClasses.includes(trimmed)) {
      // 選了班 → 在該班名單中比對 LINE 名稱
      await clearPendingClassSelect(userId);
      const displayName = pendingClass.displayName;
      console.log(`[ClassSelect] ${displayName} selected: ${trimmed}`);

      const matched = await tryMatchPreloaded(userId, displayName, trimmed);
      if (matched) {
        console.log(`[ClassSelect] Auto-matched in ${trimmed}: ${displayName}`);
        return await sendMessage(replyToken, userId,
          `找到了！歡迎加入 ${trimmed} ☺️\n\n不知道下一餐怎麼搭？跟我說你平常在哪裡買（便利商店？自助餐？早餐店？），我幫你想幾個 ABC 搭配，直接照著買就好 😊\n\n「這個能不能吃？」「玉米算澱粉嗎？」這種小問題也可以直接問我。\n\n課程中有任何問題也隨時來聊，休校長也看得到喔 ☺️`
        );
      }

      // 沒比對到 → 問姓名（帶班別資訊）
      await setPendingVerify(userId, JSON.stringify({ displayName, selectedClass: trimmed }));
      return await sendMessage(replyToken, userId,
        `好的！請告訴我你報名時填的姓名，我幫你建立專屬檔案 ☺️\n\n（直接打名字就好，例如「王美玲」）`
      );
    } else if (trimmed === '我不是課程學員') {
      await clearPendingClassSelect(userId);
      console.log(`[ClassSelect] Not a student`);
      return await sendMessage(replyToken, userId,
        `沒問題！我是休校長的小幫手，有任何飲食或健康的問題都可以問我 ☺️\n\n不知道下一餐怎麼搭？跟我說你在哪吃，我幫你想搭配！`
      );
    }
    // 回覆的不是班別選項 → 清除 pending，繼續正常流程
    await clearPendingClassSelect(userId);
  }

  // === 姓名確認：選班後比對姓名 ===
  const pendingVerify = await getPendingVerify(userId);
  if (pendingVerify) {
    // 解析 pending 資料（新格式帶班別，舊格式只有 displayName 字串）
    let verifyData = {};
    try {
      verifyData = typeof pendingVerify === 'string' && pendingVerify.startsWith('{')
        ? JSON.parse(pendingVerify) : { displayName: pendingVerify };
    } catch (_) { verifyData = { displayName: pendingVerify }; }
    const selectedClass = verifyData.selectedClass || null;

    // 學員正在回覆姓名（2-6個中文字，沒有其他複雜內容）
    const isLikelyName = /^[\u4e00-\u9fff]{2,6}$/.test(trimmed) || /^[a-zA-Z\s]{2,20}$/.test(trimmed);
    if (isLikelyName) {
      const matched = await tryMatchByRealName(userId, trimmed, selectedClass);
      await clearPendingVerify(userId);

      if (matched) {
        console.log(`[Verify] Matched by real name: ${trimmed} (class: ${selectedClass})`);
        return await sendMessage(replyToken, userId,
          `找到了！歡迎你 ${trimmed} ☺️\n\n不知道下一餐怎麼搭？跟我說你平常在哪裡買（便利商店？自助餐？早餐店？），我幫你想幾個 ABC 搭配，直接照著買就好 😊\n\n「這個能不能吃？」「玉米算澱粉嗎？」這種小問題也可以直接問我。\n\n課程中有任何問題也隨時來聊，休校長也看得到喔 ☺️`
        );
      } else {
        // 沒比對到 → 手動分班（存 class_name 到 Supabase）
        if (selectedClass) {
          try {
            const { getSupabase } = await import('@/lib/supabase');
            const sb = getSupabase();
            if (sb) {
              await sb.from('users').upsert({
                id: userId, class_name: selectedClass,
                display_name: trimmed,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'id' });
            }
            // 也更新 Redis user
            const user = await getUser(userId);
            if (user) {
              user.className = selectedClass;
              if (!user.info) user.info = {};
              if (!user.info.name) user.info.name = trimmed;
              user.lineDisplayName = verifyData.displayName || trimmed;
              const { saveUser } = await import('@/lib/user');
              await saveUser(userId, user);
            }
          } catch (e) { console.error('[Verify] Class assign error:', e); }
        }

        // 嘗試標記 preloaded 為已比對（用 LINE 名稱或真名）
        try {
          const { markPreloadedMatched } = await import('@/lib/user');
          await markPreloadedMatched(userId, verifyData.displayName || trimmed, trimmed);
        } catch (e) { console.error('[Verify] Mark preloaded error:', e); }

        console.log(`[Verify] No preload match for: ${trimmed}, assigned to ${selectedClass}`);
        return await sendMessage(replyToken, userId,
          `歡迎你 ${trimmed} ☺️\n\n不知道下一餐怎麼搭？跟我說你平常在哪裡買（便利商店？自助餐？早餐店？），我幫你想幾個 ABC 搭配，直接照著買就好 😊\n\n有任何問題隨時來聊！`
        );
      }
    }
    // 如果回覆的不像姓名（例如直接問問題），清除 pending 繼續正常流程
    await clearPendingVerify(userId);
  }

  // === ABC 小挑戰回覆處理（學員回覆推播的數字） ===
  if (/^[123]$/.test(trimmed)) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
      const quizData = await redis.get(`coach-abc-quiz:${userId}`);
      if (quizData) {
        const quiz = typeof quizData === 'string' ? JSON.parse(quizData) : quizData;
        const choiceIdx = parseInt(trimmed) - 1;
        const chosen = quiz.opts?.[choiceIdx] || '';
        await redis.del(`coach-abc-quiz:${userId}`);
        const response = `你選了「${chosen}」\n\n${quiz.feedback}\n\n又多學了一個課程知識 ☺️`;
        return await sendMessage(replyToken, userId, response);
      }
    } catch (_) { /* 不是 ABC quiz 回覆，繼續正常流程 */ }
  }

  // === 食物收集系統（題庫來自 lib/quiz-data.js） ===
  const QUIZ_KEY = (uid) => `coach-quiz:${uid}`;
  function getQuizLevel(count) {
    for (let i = QUIZ_LEVELS_DATA.length - 1; i >= 0; i--) {
      if (count >= QUIZ_LEVELS_DATA[i].min) {
        const current = QUIZ_LEVELS_DATA[i];
        const nextLevel = QUIZ_LEVELS_DATA[i + 1];
        const title = `${current.title} ${current.emoji}`;
        const nextText = nextLevel
          ? current.next.replace('{n}', nextLevel.min - count)
          : current.next;
        return { title, nextText, isMax: !nextLevel };
      }
    }
    return { title: '食物新手 🌱', nextText: '', isMax: false };
  }

  // === 瘦身知識大挑戰：網頁版（10 題一組） ===
  if (trimmed === '#瘦身知識大挑戰' || trimmed === '#知識大挑戰' || trimmed === '瘦身知識大挑戰' || trimmed === '知識大挑戰') {
    const knowledgeUrl = `https://coach-line-bot.vercel.app/knowledge?u=${userId}`;
    return await sendMessage(replyToken, userId, `🧠 瘦身知識大挑戰\n\n10 題是非題，判斷瘦身觀念是對是錯！\n打破迷思、建立正確知識 💪\n\n👉 ${knowledgeUrl}`);
  }

  // === 瘦身知識是非題（對話內，單題，零 token） ===
  function getKnowledgeLevel(count) {
    for (let i = KNOWLEDGE_LEVELS.length - 1; i >= 0; i--) {
      if (count >= KNOWLEDGE_LEVELS[i].min) return KNOWLEDGE_LEVELS[i];
    }
    return KNOWLEDGE_LEVELS[0];
  }

  const knowledgeAnswerMatch = trimmed.match(/^知識答：(\d+)→(對|錯)$/);
  if (knowledgeAnswerMatch) {
    const [, idxStr, ans] = knowledgeAnswerMatch;
    const idx = parseInt(idxStr, 10);
    const q = KNOWLEDGE_QUIZZES[idx];
    if (q) {
      const userSaidTrue = ans === '對';
      const isCorrect = userSaidTrue === q.answer;

      // 寫入 Supabase
      try {
        const { getSupabase } = await import('@/lib/supabase');
        const sb = getSupabase();
        if (sb && isCorrect) {
          await sb.from('coach_knowledge_collected').upsert(
            { user_id: userId, question_index: idx },
            { onConflict: 'user_id,question_index' }
          );
        }
      } catch (e) { console.error('[KnowledgeQuiz] Save error:', e); }

      // 計算收集數
      let collected = 0;
      try {
        const { getSupabase } = await import('@/lib/supabase');
        const sb = getSupabase();
        if (sb) {
          const { data } = await sb.from('coach_knowledge_collected').select('question_index').eq('user_id', userId);
          collected = data?.length || 0;
        }
      } catch (_) {}

      const level = getKnowledgeLevel(collected);
      const correctEmoji = q.answer ? '⭕ 對' : '❌ 錯';
      const feedback = isCorrect
        ? `答對了！🎉\n\n「${q.statement}」→ ${correctEmoji}\n\n${q.explain}\n\n📊 已掌握 ${collected} 個知識點（${level.emoji} ${level.title}）`
        : `答錯了，但學到了！😄\n\n「${q.statement}」→ ${correctEmoji}\n\n${q.explain}\n\n📊 已掌握 ${collected} 個知識點（${level.emoji} ${level.title}）`;

      return await replyWithQuickReply(replyToken, feedback, [
        { label: '再來一題', text: `再考我一題知識，不要${idx}` },
        { label: '換玩食物分類', text: '考考我食物分類' },
      ]);
    }
  }

  // 考考我瘦身知識：出一題是非題
  const knowledgeTriggerMatch = trimmed.match(/^再考我一題知識[，,]不要(\d+)$/);
  if (trimmed === '考考我瘦身知識' || knowledgeTriggerMatch) {
    const excludeIdx = knowledgeTriggerMatch ? parseInt(knowledgeTriggerMatch[1], 10) : null;

    // 讀已答對的題目
    let answeredSet = new Set();
    try {
      const { getSupabase } = await import('@/lib/supabase');
      const sb = getSupabase();
      if (sb) {
        const { data } = await sb.from('coach_knowledge_collected').select('question_index').eq('user_id', userId);
        answeredSet = new Set((data || []).map(r => r.question_index));
      }
    } catch (_) {}

    const collected = answeredSet.size;
    const level = getKnowledgeLevel(collected);

    // 建題池：排除上一題，優先出沒答對過的
    let pool = KNOWLEDGE_QUIZZES.map((q, i) => ({ ...q, _idx: i }));
    if (excludeIdx !== null) pool = pool.filter(q => q._idx !== excludeIdx);
    const unseen = pool.filter(q => !answeredSet.has(q._idx));
    const pickFrom = unseen.length > 0 ? unseen : pool;
    const pick = pickFrom[Math.floor(Math.random() * pickFrom.length)];

    const cat = KNOWLEDGE_QUIZZES[pick._idx]?.category || '';
    const catInfo = [
      { id: 'myth', emoji: '💡' }, { id: 'abc', emoji: '🔥' },
      { id: 'nutrition', emoji: '🥗' }, { id: 'mindset', emoji: '🧠' },
      { id: 'behavior', emoji: '🎯' }, { id: 'food_science', emoji: '🔬' },
    ].find(c => c.id === cat);
    const catEmoji = catInfo?.emoji || '🧠';

    const intro = collected === 0
      ? `${catEmoji} 是非題來囉！`
      : `已掌握 ${collected} 個知識點（${level.emoji} ${level.title}）\n\n${catEmoji} 是非題來囉！`;

    // 存 pending 狀態（手動打「對」「錯」也能識別）
    try {
      const r2 = (await import('@upstash/redis')).Redis;
      const redis2 = new r2({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
      await redis2.set(PENDING_QUIZ_KEY(userId), JSON.stringify({ type: 'knowledge', idx: pick._idx }), { ex: 300 });
    } catch (_) {}

    return await replyWithQuickReply(replyToken, `${intro}\n\n「${pick.statement}」\n\n這句話是對還是錯？`, [
      { label: '⭕ 對', text: `知識答：${pick._idx}→對` },
      { label: '❌ 錯', text: `知識答：${pick._idx}→錯` },
      { label: '換一題', text: `再考我一題知識，不要${pick._idx}` },
      { label: '換玩食物分類', text: '考考我食物分類' },
    ]);
  }

  // === 食物大挑戰：網頁版測驗遊戲 ===
  if (trimmed === '#食物大挑戰' || trimmed === '食物大挑戰') {
    const quizUrl = `https://coach-line-bot.vercel.app/quiz?u=${userId}`;
    return await sendMessage(replyToken, userId, `🍽️ 食物分類大挑戰\n\n10 題限時挑戰，答對就能收集食物！\n看你能認出幾種食物的真面目 😄\n\n👉 ${quizUrl}`);
  }

  // === 食物/知識測驗：手動打答案也能識別（Quick Reply 被其他訊息沖掉時） ===
  const PENDING_QUIZ_KEY = (uid) => `coach-quiz-pending:${uid}`;
  try {
    const r = (await import('@upstash/redis')).Redis;
    const redis = new r({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    const pending = await redis.get(PENDING_QUIZ_KEY(userId));
    if (pending) {
      const p = typeof pending === 'string' ? JSON.parse(pending) : pending;
      await redis.del(PENDING_QUIZ_KEY(userId));
      if (p.type === 'food' && (trimmed === p.optA || trimmed === p.optB)) {
        // 轉換成標準格式，讓下面的 quizAnswerMatch 接手
        const fakeText = `食物分類答：${p.food}→${trimmed}`;
        return await processEvent({ ...event, message: { ...event.message, text: fakeText } });
      }
      if (p.type === 'knowledge' && (trimmed === '對' || trimmed === '錯')) {
        const fakeText = `知識答：${p.idx}→${trimmed}`;
        return await processEvent({ ...event, message: { ...event.message, text: fakeText } });
      }
      // 不是答案，pending 已清除，繼續正常流程
    }
  } catch (_) {}

  // === 食物分類答題：學員選了答案 ===
  const quizAnswerMatch = trimmed.match(/^食物分類答：(.+)→(.+)$/);
  if (quizAnswerMatch) {
    const [, food, answer] = quizAnswerMatch;
    const quiz = FOOD_QUIZZES.find(q => q.food === food);
    if (quiz) {
      const isCorrect = answer === quiz.correct;
      const r = (await import('@upstash/redis')).Redis;
      const redis = new r({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

      if (isCorrect) {
        // 加入收集（用 Set 避免重複計算）
        await redis.sadd(QUIZ_KEY(userId), food);
        // 同步寫 Supabase（Dashboard 讀這張表）
        try {
          const { getSupabase } = await import('@/lib/supabase');
          const sb = getSupabase();
          if (sb) {
            await sb.from('coach_quiz_collected').upsert(
              { user_id: userId, food },
              { onConflict: 'user_id,food' }
            );
          }
        } catch (e) { console.error('[FoodQuiz] Supabase save error:', e); }
      }
      const collected = await redis.scard(QUIZ_KEY(userId)) || 0;
      const level = getQuizLevel(collected);

      const feedback = isCorrect
        ? `又多認識一個！🎉\n\n${quiz.food}是${quiz.correct}。${quiz.explain}\n\n📊 你已經認識 ${collected} 種食物了（${level.title}）`
        : `又學到了！😄\n\n${quiz.food}不是${answer}，是${quiz.correct}。\n\n${quiz.explain}\n\n📊 你目前認識 ${collected} 種食物（${level.title}）`;

      return await replyWithQuickReply(replyToken, feedback, [
        { label: '繼續收集', text: `再考我一題食物分類，不要${food}` },
        { label: '我有食物想問', text: '我想問其他食物能不能吃' },
      ]);
    }
  }

  // === 舊版「公布答案」相容（直接回覆不走 AI） ===
  if (trimmed.startsWith('食物分類答案：')) {
    return await replyWithQuickReply(replyToken, trimmed.replace('食物分類答案：', ''), [
      { label: '繼續收集', text: '再考我一題食物分類' },
      { label: '我有食物想問', text: '我想問其他食物能不能吃' },
    ]);
  }

  // === 考考我：選擇遊戲 ===
  if (trimmed === '考考我') {
    return await replyWithQuickReply(replyToken, '今天想玩哪個？😄', [
      { label: '🍽️ 食物分類', text: '考考我食物分類' },
      { label: '🧠 瘦身知識', text: '考考我瘦身知識' },
    ]);
  }

  // === 考考我食物分類：隨機食物分類測驗（支援排除上一題 + 優先出沒答過的） ===
  const quizTriggerMatch = trimmed.match(/^再考我一題食物分類[，,]不要(.+)$/);
  if (trimmed === '考考我食物分類' || trimmed === '再考我一題食物分類' || quizTriggerMatch) {
    const excludeFood = quizTriggerMatch ? quizTriggerMatch[1] : null;
    const r = (await import('@upstash/redis')).Redis;
    const redis = new r({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    let answered = await redis.smembers(QUIZ_KEY(userId)) || [];
    // 對齊契約 §3.5：Redis SET miss 時從 Supabase coach_quiz_collected 回補
    // 防 Redis 異常清檔導致學員看到已答過的食物被當「新題」重複出
    if (answered.length === 0) {
      try {
        const { getSupabase } = await import('@/lib/supabase');
        const sb = getSupabase();
        if (sb) {
          const { data } = await sb.from('coach_quiz_collected')
            .select('food').eq('user_id', userId);
          const foods = (data || []).map(row => row.food).filter(Boolean);
          if (foods.length > 0) {
            await redis.sadd(QUIZ_KEY(userId), ...foods);
            answered = foods;
            console.log(`[FoodQuiz] Read-through restored ${foods.length} foods for ${userId.slice(0, 8)}`);
          }
        }
      } catch (e) { console.error('[FoodQuiz] Read-through error:', e); }
    }
    const collected = answered.length;
    const level = getQuizLevel(collected);

    let pool = FOOD_QUIZZES;
    if (excludeFood) pool = pool.filter(q => q.food !== excludeFood);

    // 優先出沒答過的題目
    const unseen = pool.filter(q => !answered.includes(q.food));
    const pickFrom = unseen.length > 0 ? unseen : pool;
    const quiz = pickFrom[Math.floor(Math.random() * pickFrom.length)];

    const intro = collected === 0
      ? `考考你 😄`
      : `你已經認識 ${collected} 種食物了（${level.title}）\n繼續收集 😄`;

    // 存 pending 狀態（手動打答案時也能識別）
    await redis.set(PENDING_QUIZ_KEY(userId), JSON.stringify({ type: 'food', food: quiz.food, optA: quiz.optA, optB: quiz.optB }), { ex: 300 });

    return await replyWithQuickReply(replyToken, `${intro}\n\n${quiz.food}是${quiz.optA}還是${quiz.optB}？`, [
      { label: quiz.optA, text: `食物分類答：${quiz.food}→${quiz.optA}` },
      { label: quiz.optB, text: `食物分類答：${quiz.food}→${quiz.optB}` },
      { label: '換一題', text: `再考我一題食物分類，不要${quiz.food}` },
      { label: '我有食物想問', text: '我想問其他食物能不能吃' },
    ]);
  }

  // === 目標回報：三個 Quick Reply 按鈕的處理 ===
  if (trimmed === '目標回報：我做到了') {
    const goal = await getActiveGoal(userId);
    if (goal) {
      await completeGoal(userId);
      const userName = (await getUser(userId))?.parsed?.name || '你';
      return await replyWithQuickReply(replyToken,
        `${userName}，太棒了！🎉\n\n「${goal.goal_text}」——你真的做到了！\n\n這不是小事，這代表你已經開始建立新的習慣了。每多做一次，下次就更自然。\n\n要不要挑戰下一步？跟我說說你最近的狀況，我幫你想下一個目標 😊`,
        [
          { label: '設下一個目標', text: '我想設定下一個目標' },
          { label: '先這樣就好', text: '先這樣就好' },
        ]
      );
    }
    return await sendMessage(replyToken, userId, '你目前沒有進行中的目標，要不要聊聊你的狀況，一起設一個？😊');
  }

  if (trimmed === '目標回報：還在努力') {
    const goal = await getActiveGoal(userId);
    if (goal) {
      return await sendMessage(replyToken, userId,
        `沒關係，「${goal.goal_text}」本來就不用一次做到完美 😊\n\n只要你有意識到這件事，就已經在改變了。哪怕這週只做到一次，那也是一次的進步。\n\n有什麼卡住的地方嗎？跟我說，我們一起想辦法。`
      );
    }
    return await sendMessage(replyToken, userId, '繼續加油！有什麼想聊的隨時來 😊');
  }

  if (trimmed === '目標回報：想調整目標') {
    const goal = await getActiveGoal(userId);
    if (goal) {
      await completeGoal(userId); // 先清掉舊的，讓 AI 可以設新的
      return await sendMessage(replyToken, userId,
        `好的！之前的目標是「${goal.goal_text}」。\n\n跟我說說哪裡覺得太難或不適合，我幫你調整成更容易執行的版本 😊`
      );
    }
    return await sendMessage(replyToken, userId, '你目前沒有進行中的目標，要不要聊聊你的狀況，一起設一個？😊');
  }

  // === 我的進步 → 個人 Dashboard ===
  if (trimmed === '我的進步') {
    const dashboardUrl = `https://coach-line-bot.vercel.app/dashboard?u=${userId}`;
    const user = await getUser(userId);
    const userName = user?.parsed?.name || user?.lineDisplayName || '你';
    return await sendMessage(replyToken, userId,
      `${userName}，你的個人進度都在這裡 ☺️\n\n👉 ${dashboardUrl}\n\n心情變化、進步紀錄、食物知識、自我覺察⋯⋯小幫手都幫你記著了`
    );
  }

  // === 選單觸發：Rich Menu 按鈕 → 問題 + Quick Reply 引導 ===
  const menuTrigger = getMenuTrigger(trimmed);
  if (menuTrigger) {
    console.log(`[Menu] Trigger: "${trimmed}"`);
    return await replyWithQuickReply(replyToken, menuTrigger.response, menuTrigger.quickReply);
  }

  if (['怎麼用', '使用說明', '功能', '你能做什麼'].includes(trimmed)) {
    return await sendMessage(replyToken, userId,
      `我可以陪你聊的話題：

💭 心態調整 — 吃太多的自責、停滯期焦慮、被人說胖的難過
🍽️ 飲食觀念 — 菜肉飯順序怎麼用、外食怎麼選、份量怎麼抓
🎯 目標設定 — 怎麼設定不會放棄的目標
💪 持續的力量 — 撐不下去的時候怎麼辦

直接打字跟我說你的狀況就好！`
    );
  }

  // 存入 buffer
  const count = await bufferMessage(userId, { text: trimmed, replyToken });
  console.log(`[Buffer] ${userId?.substring(0, 8)}: msg #${count} buffered "${trimmed.substring(0, 30)}..."`);

  // 排程延遲處理（不阻塞 HTTP 回覆）
  const delayedProcess = (async () => {
    // 第一階段：等 3 秒，看有沒有新訊息
    await sleep(BATCH_DELAY);
    const ready = await isBufferReady(userId);
    if (!ready) {
      console.log(`[Buffer] ${userId?.substring(0, 8)}: not ready (new msg arrived), skipping`);
      return;
    }

    // 第二階段：再等 5 秒讓用戶打完
    await sleep(TEXT_EXTRA_DELAY);
    const stillReady = await isBufferReady(userId, BATCH_DELAY + TEXT_EXTRA_DELAY - 1000);
    if (!stillReady) {
      console.log(`[Buffer] ${userId?.substring(0, 8)}: new msg during extra wait, skipping`);
      return;
    }

    // 取出 buffer
    const buffer = await consumeBuffer(userId);
    if (!buffer || buffer.messages.length === 0) return;

    console.log(`[Batch] ${userId?.substring(0, 8)}: processing ${buffer.messages.length} messages`);
    await processBatchedMessages(userId, buffer.messages);
  })();

  if (globalThis.__nextWaitUntil) {
    globalThis.__nextWaitUntil(delayedProcess);
  } else {
    await delayedProcess;
  }
}

/**
 * 批次處理合併後的訊息
 * @param {string} userId
 * @param {Array<{text: string, replyToken: string}>} messages
 */
// 客套話快速回覆（跳過所有 AI 呼叫，省 3 次 Gemini API）
const QUICK_REPLIES = [
  { pattern: /^(謝謝|感謝|謝啦|感恩|3Q|thx|thanks|thank you|謝謝你|感謝你|太感謝了|好的謝謝|OK謝謝|ok謝謝|了解謝謝)[!！。~～♡❤️🙏]*$/i, replies: ['不客氣～有問題隨時問 😊', '不會！有需要再找我 💪', '別客氣～我都在 😊'] },
  { pattern: /^(好的?|OK|ok|了解|收到|知道了|明白|懂了|嗯嗯|喔喔|哦哦|好喔|好唷|好哦|好滴|好噠)[!！。~～👍]*$/i, replies: ['加油！💪', '有問題再問我～', '👍'] },
  { pattern: /^(早安|午安|晚安|嗨|哈囉|你好|hi|hello)[!！。~～☀️🌙]*$/i, replies: ['嗨～今天過得怎麼樣？', '你好呀～有什麼想聊的嗎？😊'] },
  { pattern: /^(哈哈+|哈+|嘻嘻|呵呵|笑死|XD|xd|lol|LOL)+[!！。~～]*$/i, replies: ['😄', '哈哈～', '😆'] },
  { pattern: /^(讚|太棒了|好厲害|厲害|太強了|好猛|太讚了|棒棒|好棒)[!！。~～👏🔥💪]*$/i, replies: ['謝謝～繼續加油！💪', '哈哈，一起努力 😊'] },
  { pattern: /^(辛苦了|辛苦|加油)[!！。~～💪]*$/i, replies: ['謝謝～你也加油！💪', '一起努力 😊'] },
  { pattern: /^(繼續保持|會的|我會的|我會加油|會繼續努力|好我會|我會努力|會努力)[!！。~～💪]*$/i, replies: ['你一定可以的 💪', '一起加油 😊', '💪'] },
  { pattern: /^(對[呀啊]?|是[啊的]?|沒錯|真的|確實|也是|對對對|是呀)[!！。~～]*$/i, replies: ['😊', '👍', '💪'] },
  { pattern: /^(先這樣|就這樣|沒問題了?|沒事了?|好的?先這樣|就醬|先這樣吧|好啦?先這樣)[!！。~～]*$/i, replies: ['好的～有需要隨時找我 😊', '掰掰～加油！💪', '隨時找我聊～ 😊'] },
  // 2026-04-03 擴大：「好/OK + 短尾巴」組合（試試看/慢慢來/加油/謝謝...）
  { pattern: /^(好的?|OK|ok|嗯)[，、\s]*(加油|試試看|試試|慢慢來|我[會再來]|我知道|我試試|謝謝[你]?|沒問題|來試|會注意|會的|努力|繼續|保持|了解了)[!！。~～👌💪😊🙌]*$/i, replies: ['一起加油！💪', '加油，有變化跟我說～ 😊', '穩穩走，我都在 💪'] },
  // 「可以/應該可以/好像有喔」等輕度回應
  { pattern: /^(可以[～~]?|應該可以|好像有喔?|有喔?|沒有耶|還好|不錯[喔哦]?|蠻好的|執行很容易)[!！。~～😊]*$/i, replies: ['很棒！繼續保持 😊', '💪', '👍'] },
  { pattern: /^[\s]*[👍❤️💪🙏😊👏🔥💕🥰😍😘🫶✨⭐️🌟]+[\s]*$/, replies: ['😊', '💪', '❤️'] },
  // LINE emoji 描述格式（如「好👌(Affirmative)」）
  { pattern: /^(好的?|OK|ok|加油|讚|棒)[👌👍💪😊🙌]*\([A-Za-z!]+\)[\s]*$/i, replies: ['💪', '加油！😊', '👍'] },
];

// 防流失 Quick Reply 按鈕的純文字比對回應表
// key = QR button 的 text 欄位（完全比對），value = { reply(name), qr? }
const CHURN_QR_RESPONSES = {
  // ── 21+ 天重啟框架 ──
  '最近吃得有點亂': {
    reply: (n) => `${n}，亂也沒關係，不用從頭來過。\n\n跟我說最近是哪一餐最難控制？我們從那一餐開始調整就好 😊`,
    qr: [
      { label: '晚餐最難', text: '晚餐最難控制' },
      { label: '外食太多', text: '外食太多不知道怎麼選' },
      { label: '聚餐吃太多', text: '聚餐吃太多管不住' },
      { label: '睡前會嘴饞', text: '睡前很容易嘴饞' },
    ],
  },
  '體重有點回升，想重新來過': {
    reply: (n) => `${n}，回升很正常，這不代表你失敗了。\n\n你現在最想先從哪裡重新抓回來？`,
    qr: [
      { label: '飲食先調整', text: '從飲食先調整' },
      { label: '先建回運動習慣', text: '先把運動習慣建回來' },
      { label: '睡眠壓力先顧', text: '睡眠和壓力先顧' },
      { label: '不確定從哪開始', text: '不確定從哪裡開始' },
    ],
  },
  '其實還好，只是沒什麼動靜': {
    reply: (n) => `${n}，你說還好我就放心了 😊\n\n最近有沒有什麼你覺得做得不錯的地方？不管大小，跟我說說 💪`,
  },
  '我想繼續，不知道從哪裡開始': {
    reply: (n) => `${n}，想繼續就是最好的開始了 😊\n\n今天晚餐打算怎麼吃？跟我說一下你的情況，我幫你想一個最小的第一步 🪜`,
  },

  // ── 14-20 天通用 ──
  '說實話，最近吃得有點亂': {
    reply: (n) => `${n}，說出來就對了！亂沒關係，我們不從頭來過，只從下一餐開始。\n\n最近哪一餐最難控制？`,
    qr: [
      { label: '晚餐最難', text: '晚餐最難控制' },
      { label: '外食太多', text: '外食太多不知道怎麼選' },
      { label: '聚餐吃太多', text: '聚餐吃太多管不住' },
      { label: '睡前會嘴饞', text: '睡前很容易嘴饞' },
    ],
  },
  '感覺沒什麼進展，提不起勁': {
    reply: (n) => `${n}，有這種感覺很正常，不代表你沒在進步。\n\n你覺得是「身體沒動靜」還是「心裡沒動力」？`,
    qr: [
      { label: '體重沒變化', text: '體重一直沒有變化' },
      { label: '心裡有點疲了', text: '心裡有點疲了提不起勁' },
      { label: '兩個都有', text: '兩個都有' },
    ],
  },
  '最近太忙了，這塊先放著': {
    reply: (n) => `${n}，忙的時候不用逼自己 😊\n\n不過忙的時候飲食最容易亂掉，你最常遇到的情境是？`,
    qr: [
      { label: '外食沒得選', text: '外食不知道怎麼選' },
      { label: '沒時間吃正餐', text: '忙到沒時間好好吃飯' },
      { label: '用吃紓壓', text: '壓力大容易用吃紓壓' },
    ],
  },
  '其實還好，只是沒想到要傳': {
    reply: (n) => `${n}，你說還好我就放心了 😊\n\n那最近有沒有什麼讓你覺得「我有在進步」的小事？跟我說說，我幫你記下來 💪`,
  },

  // ── 14-20 天 late 課程階段 ──
  '說實話，有點懈怠了': {
    reply: (n) => `${n}，懈怠也是課程的一部分，你不是第一個 😊\n\n懈怠的原因是「太累了」還是「不知道還要做什麼」？`,
    qr: [
      { label: '太累想休息', text: '太累了，想先休息' },
      { label: '不知道下一步', text: '不知道接下來還要做什麼' },
      { label: '覺得效果到頂了', text: '覺得效果差不多到頂了' },
    ],
  },
  '沒什麼進展，有點沮喪': {
    reply: (n) => `${n}，到課程後段還沒看到你想要的結果，這種感覺很難受。\n\n你說的沒進展，主要是體重還是身體感覺？`,
    qr: [
      { label: '體重沒降', text: '體重一直沒有降' },
      { label: '身體沒變化', text: '身體感覺沒什麼變化' },
      { label: '兩個都有', text: '兩個都有' },
    ],
  },
  '其實還好，只是比較少來': {
    reply: (n) => `${n}，還好就好 😊\n\n快到課程後段了，有沒有一個你最想在結束前做到的事？`,
  },
  '最近生活有點亂，顧不到這個': {
    reply: (n) => `${n}，生活有時候就是這樣，沒辦法每件事都顧到。\n\n在亂的時候，有沒有一件跟飲食有關的事你還有在做？`,
  },

  // ── 7-13 天 early 課程階段 ──
  '外食太多，不確定自己有沒有搭對': {
    reply: (n) => `${n}，外食搭配是課程前期最常見的困惑 😊\n\n你最常在哪裡吃外食？自助餐、便利商店、還是餐廳？`,
    qr: [
      { label: '自助餐', text: '主要吃自助餐' },
      { label: '便利商店', text: '主要吃便利商店' },
      { label: '餐廳或小吃', text: '主要吃餐廳或外帶小吃' },
    ],
  },
  '體重沒在動，有點心灰意冷': {
    reply: (n) => `${n}，課程前期體重沒動很正常，這不代表你做錯了。\n\n說說看你這幾天的飲食大概怎麼吃？我幫你確認一下方向有沒有問題 😊`,
  },
  '其實還好，只是沒想到要來聊': {
    reply: (n) => `${n}，好的，那有什麼想問的隨時來找我 😊\n\n順便問一下，菜肉飯的順序你這幾天有在用嗎？`,
    qr: [
      { label: '有在用', text: '有在用菜肉飯順序' },
      { label: '有時候忘了', text: '有時候會忘記' },
      { label: '外食很難做到', text: '外食的時候很難做到' },
    ],
  },
  '最近太忙了，真的顧不到': {
    reply: (n) => `${n}，忙也是真實的生活啊，不用全部都做到。\n\n忙的時候最難維持的是哪一塊？`,
    qr: [
      { label: '飲食順序顧不到', text: '飲食的菜肉飯順序顧不到' },
      { label: '外食亂吃', text: '外食沒時間選，就亂吃了' },
      { label: '根本沒時間吃飯', text: '忙到根本沒時間好好吃飯' },
    ],
  },

  // ── 7-13 天 mid 課程階段 ──
  '覺得吃得還行，但體重沒太大變化': {
    reply: (n) => `${n}，吃得還行但體重沒動，這是最常讓人抓狂的情境 😅\n\n跟我說說你平常怎麼吃，我幫你看看有沒有什麼隱藏的地方 😊`,
  },
  '聚餐外食變多，有點抓不住': {
    reply: (n) => `${n}，聚餐多是真實的生活，不用逃避 😊\n\n你通常在聚餐的時候最難拒絕的是什麼？`,
    qr: [
      { label: '白飯麵食吃太多', text: '白飯麵食容易吃太多' },
      { label: '喝酒應酬', text: '聚餐場合要喝酒' },
      { label: '甜點飯後一定要吃', text: '飯後甜點很難拒絕' },
    ],
  },
  '習慣有點建立了，但最近在偷懶': {
    reply: (n) => `${n}，能說出來就很好了 😊 偷懶不代表壞掉。\n\n你說的偷懶，是飲食的哪一塊？`,
    qr: [
      { label: '蔬菜不夠', text: '蔬菜沒有認真吃夠' },
      { label: '飲食順序沒照做', text: '飲食順序沒有認真照做' },
      { label: '蛋白質不夠', text: '蛋白質吃得不夠' },
    ],
  },
  '說真的，最近有一段時間亂吃': {
    reply: (n) => `${n}，亂也說出來了，這是誠實面對的開始 😊\n\n你說的亂，是哪一種亂？`,
    qr: [
      { label: '澱粉吃太多', text: '澱粉類吃太多了' },
      { label: '壓力大用吃紓壓', text: '壓力大的時候用吃紓壓' },
      { label: '甜食零食增加了', text: '甜食零食增加了' },
    ],
  },

  // ── 7-13 天 late 課程階段 ──
  '覺得快結業了，反而有點懈怠': {
    reply: (n) => `${n}，快到終點反而懈怠——這比你想像的更常見 😊\n\n現在讓你最想放棄的原因是什麼？`,
    qr: [
      { label: '效果停滯沒動力', text: '效果停滯，沒有動力繼續' },
      { label: '覺得夠了想休息', text: '覺得差不多了，想先休息' },
      { label: '生活太忙顧不到', text: '生活太忙，顧不到了' },
    ],
  },
  '效果沒有想像中明顯，有點失去動力': {
    reply: (n) => `${n}，課程到後段還覺得效果不明顯，這種失落感很真實。\n\n你說的效果，主要是體重還是身材？`,
    qr: [
      { label: '體重沒降多少', text: '體重沒有降多少' },
      { label: '身材變化不明顯', text: '身材看起來沒什麼變化' },
      { label: '兩個都有', text: '體重和身材都沒有明顯變化' },
    ],
  },
  '其實還有在做，只是沒有傳訊息的習慣': {
    reply: (n) => `${n}，有在做就夠了 💪 跟我聊能讓你看到自己有沒有走偏，不然最後才發現方向錯了。\n\n能跟我說說最近你都怎麼吃嗎？隨便說就好 😊`,
  },
  '最近生活有點亂，這塊先放著了': {
    reply: (n) => `${n}，生活亂的時候先顧住最重要的就好。\n\n如果只能維持一個飲食習慣，你現在還有在做哪一個？`,
    qr: [
      { label: '菜肉飯順序', text: '菜肉飯的順序還有在做' },
      { label: '蛋白質優先', text: '蛋白質優先還有在做' },
      { label: '都沒在做了', text: '說實話，都沒在做了' },
    ],
  },
};

/**
 * 🔑 同主題重複偵測（方向 1+3）
 * 用中文 bigram 比對最近用戶訊息，偵測同主題反覆提問
 */
function detectTopicRepetition(chatHistory, currentMessage) {
  const userMessages = chatHistory
    .filter(m => m.role === 'user')
    .map(m => m.parts?.[0]?.text || '')
    .filter(t => t.length > 5)
    .slice(-5);

  if (userMessages.length < 2) return { count: 1, brief: false, summarize: false };

  const getBigrams = (text) => {
    const chars = text.replace(/[^\u4e00-\u9fff]/g, '');
    const set = new Set();
    for (let i = 0; i < chars.length - 1; i++) set.add(chars.substring(i, i + 2));
    return set;
  };

  const currentBigrams = getBigrams(currentMessage);
  if (currentBigrams.size < 2) return { count: 1, brief: false, summarize: false };

  let overlapCount = 0;
  for (const msg of userMessages) {
    const msgBigrams = getBigrams(msg);
    let overlap = 0;
    for (const b of currentBigrams) if (msgBigrams.has(b)) overlap++;
    if (overlap >= 2) overlapCount++;
  }

  return {
    count: overlapCount + 1,
    brief: overlapCount >= 2,
    summarize: overlapCount >= 4,
  };
}

function getQuickReply(text) {
  const trimmed = text.trim();
  for (const { pattern, replies } of QUICK_REPLIES) {
    if (pattern.test(trimmed)) {
      return replies[Math.floor(Math.random() * replies.length)];
    }
  }
  return null;
}

async function processBatchedMessages(userId, messages) {
  // 合併所有文字（用換行連接）
  const combinedText = messages.map(m => m.text).join('\n');
  // 用最後一條的 replyToken（最新的才有效）
  const lastReplyToken = messages[messages.length - 1].replyToken;

  // === 班級結業檢查 ===
  let classStatus = 'active';
  try {
    const checkUser = await getUser(userId);
    if (checkUser?.className || checkUser?.info?.className) {
      const cn = checkUser.className || checkUser.info?.className;
      classStatus = await getClassStatus(cn) || 'active';
    } else {
      // 沒有 class_name 的學員，從 Supabase 查
      const { getSupabase } = await import('@/lib/supabase');
      const sb = getSupabase();
      if (sb) {
        const { data } = await sb.from('users').select('class_name').eq('id', userId).single();
        if (data?.class_name) {
          classStatus = await getClassStatus(data.class_name) || 'active';
        }
      }
    }
  } catch (_) {}

  // === expired 學員：一天一次限制（不再完全鎖死）===
  if (classStatus === 'expired') {
    const { Redis } = await import('@upstash/redis');
    const _rGrad = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    const gradDailyKey = `coach-grad-daily:${userId}`;
    const todayCount = await _rGrad.get(gradDailyKey);
    if (todayCount && parseInt(todayCount) >= 1) {
      console.log(`[ClassCheck] ${userId?.substring(0, 8)} expired, daily limit reached`);
      await sendMessage(lastReplyToken, userId,
        '小幫手主要的時間要優先幫助在學的學員，所以一天只能跟你聊一次 ☺️\n\n' +
        '如果你想像之前一樣隨時都能問，可以跟助教說想續報，小幫手會繼續全力陪你 😊'
      );
      await addChatMessage(userId, 'user', combinedText);
      await addChatMessage(userId, 'assistant', '（每日限制提醒）');
      return;
    }
    // 設每日計數，TTL 到台灣時間隔天 00:00
    const now = new Date();
    const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const twMidnight = new Date(twNow);
    twMidnight.setUTCHours(24, 0, 0, 0);
    const ttl = Math.max(Math.floor((twMidnight - twNow) / 1000), 60);
    await _rGrad.set(gradDailyKey, '1', { ex: ttl });
  }

  // === 圖片 marker：私訊收到 image 60 秒內若有文字進來，前綴 marker 給 AI ===
  // 避免 AI 拿到「這是圖片」這類 hint 字就腦補看到照片內容（Shair 事件 2026-04-28）
  let imageMarkerPrefix = '';
  try {
    const { Redis } = await import('@upstash/redis');
    const _rImgChk = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    const imgFlag = await _rImgChk.get(`coach-image-pending:${userId}`);
    if (imgFlag) {
      imageMarkerPrefix = '[系統提示：學員剛剛傳了一張圖片給你，但你沒有讀圖能力，看不到圖片內容。請在回覆開頭坦誠告訴學員「我看不到你傳的照片」，並引導他用文字描述吃了什麼。絕對不要假裝看到、不要描述份量顏色菜色組成、不要套用知識庫範本去腦補細節。]\n\n學員的訊息：';
      await _rImgChk.del(`coach-image-pending:${userId}`);
      console.log(`[ImageMarker] ${userId?.substring(0, 8)}: marker injected, flag cleared`);
    }
  } catch (e) {
    console.error('[ImageMarker] check error:', e.message);
  }

  // === Code enforcement：照片能力限制（code gate + AI 判定，不誤殺）===
  // 涵蓋兩類句式：(1) 問能力的（你能不能看照片）(2) 假設你看得到的（這是圖片/這張照片）
  const PHOTO_KEYWORDS = [
    '看照片', '傳照片', '拍照', '傳圖', '看圖', '看照', '傳張', '拍給你', '照片給你', '成分表照', '看成分表',
    '這是圖片', '這是圖', '這張照片', '這張圖', '看一下這', '幫我看這', '剛剛傳的'
  ];
  const hasPhotoKeyword = PHOTO_KEYWORDS.some(kw => combinedText.includes(kw));
  if (hasPhotoKeyword) {
    // AI 輕量判定：學員是在問小幫手能不能看照片，還是只是提到拍照
    try {
      const GEMINI_KEY = process.env.GEMINI_API_KEY;
      const judgeRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `學員說：「${combinedText.substring(0, 200)}」\n\n判斷：學員是在「要求你看照片/傳照片給你/問你能不能看照片」嗎？\n\n是 = 學員期待你能處理圖片（例如「你可以看照片嗎」「我傳照片給你」「幫我看這張」）\n不是 = 學員只是在對話中提到拍照這個動作（例如「我習慣拍照記錄飲食」「之前有拍照」）\n\n只回答 YES 或 NO` }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 10, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      );
      if (judgeRes.ok) {
        const judgeData = await judgeRes.json();
        const judgeText = judgeData?.candidates?.[0]?.content?.parts?.filter(p => p.text).pop()?.text?.trim() || '';
        if (judgeText.toUpperCase().includes('YES')) {
          console.log(`[PhotoBlock] ${userId?.substring(0, 8)}: confirmed asking about photo ability`);
          const photoReply = '我沒辦法看照片，但你用文字跟我說吃了什麼，我一樣能幫你 😊\n\n例如跟我說「滷雞腿、青菜兩份、半碗飯」，我就能幫你看搭配。如果想確認成分表，把前幾項成分打字給我就好！';
          await sendMessage(lastReplyToken, userId, photoReply);
          await Promise.all([
            addChatMessage(userId, 'user', combinedText),
            addChatMessage(userId, 'assistant', photoReply),
            recordInteraction(userId),
          ]);
          return;
        }
        console.log(`[PhotoBlock] ${userId?.substring(0, 8)}: not asking about photo, pass through`);
      }
    } catch (e) {
      console.error('[PhotoBlock] AI judge error (pass through):', e.message);
    }
  }

  // === 客套話短路：省掉 3 次 Gemini API ===
  const quickReply = getQuickReply(combinedText);
  if (quickReply) {
    console.log(`[QuickReply] ${userId?.substring(0, 8)}: "${combinedText}" → skip AI`);
    await sendMessage(lastReplyToken, userId, quickReply);
    // 仍記錄對話（讓歷史完整）+ 記錄互動
    await Promise.all([
      addChatMessage(userId, 'user', combinedText),
      addChatMessage(userId, 'assistant', quickReply),
      recordInteraction(userId),
      recordStreak(userId).catch(() => {}),
    ]);
    return;
  }

  // === 防流失 QR 攔截：比對推播後的 Quick Reply 按鈕文字，零 token 回覆 ===
  const churnMatch = CHURN_QR_RESPONSES[combinedText.trim()];
  if (churnMatch) {
    const checkUser = await getUser(userId).catch(() => null);
    const name = checkUser?.lineDisplayName || checkUser?.info?.name || '同學';
    const replyText = churnMatch.reply(name);
    console.log(`[ChurnQR] ${userId?.substring(0, 8)}: "${combinedText.substring(0, 20)}" → intercept`);
    if (churnMatch.qr) {
      await replyWithQuickReply(lastReplyToken, replyText, churnMatch.qr);
    } else {
      await sendMessage(lastReplyToken, userId, replyText);
    }
    await Promise.all([
      addChatMessage(userId, 'user', combinedText),
      addChatMessage(userId, 'assistant', replyText),
      recordInteraction(userId),
      recordStreak(userId).catch(() => {}),
    ]);
    return;
  }

  try {
    // === 並行載入：對話歷史 + 用戶資料 + 最近標籤（取代 journey/summary）===
    const [rawHistory, user, recentTags] = await Promise.all([
      getChatHistory(userId),
      getUser(userId),
      getRecentTopics(userId, 15),
    ]);

    const chatHistory = formatChatForGemini(rawHistory);

    // === 首次私訊且尚無資料：嘗試比對預載入 ===
    let matchedPreload = false;
    if (!user || !user.info || Object.keys(user.info).length === 0) {
      try {
        const profile = await getProfile(userId);
        if (profile?.displayName) {
          matchedPreload = await tryMatchPreloaded(userId, profile.displayName);
          if (matchedPreload) {
            console.log(`[MSG] Auto-matched preloaded intro for ${profile.displayName}`);
          }
        }
      } catch (err) {
        console.error('[MSG] Preload match error:', err);
      }
    }

    // === 補救：display_name 缺失時主動 fetch LINE profile ===
    if (user && !user.lineDisplayName) {
      try {
        const profile = await getProfile(userId);
        if (profile?.displayName) {
          user.lineDisplayName = profile.displayName;
          const { saveUser } = await import('@/lib/user');
          await saveUser(userId, user);
          console.log(`[MSG] Updated missing displayName: ${profile.displayName}`);
        }
      } catch (_) { /* 不阻塞主流程 */ }
    }

    // === 檢查是否是自我介紹 ===
    let isIntro = false;
    if (looksLikeIntroduction(combinedText)) {
      isIntro = true;
      processIntroduction(userId, combinedText).catch(err =>
        console.error('[User] Intro processing error:', err)
      );
      console.log(`[Intro] Detected for ${userId?.substring(0, 8)}, processing...`);
    }

    // === 記錄「今天第一次互動」狀態（recordInteraction 前，否則 lastInteractionAt 已更新）===
    const isFirstToday = isFirstInteractionToday(user);

    // === 記錄互動 & streak ===
    const updatedUser = await recordInteraction(userId);
    recordStreak(userId).catch(() => {}); // 非阻塞
    const totalTopics = await getTopicCount(userId);

    let milestone = null;
    if (totalTopics > 0) {
      milestone = await checkMilestones(userId, totalTopics);
    }

    // === AI 意圖分類（提前呼叫，結果同時用於知識路由 + 用戶切片選取）===
    const recentUserMsgs = chatHistory
      .filter(msg => msg.role === 'user')
      .map(msg => msg.parts?.[0]?.text || '')
      .slice(-2)
      .join('；');
    const intent = await classifyIntent(combinedText, recentUserMsgs, userId);
    const profileSlices = intent?.slices || null;

    // === 載入當前目標 ===
    const activeGoal = await getActiveGoal(userId);

    // === 🔑 Follow-up 偵測：30 分鐘內已有完整上下文 → 追問可輕量化 ===
    let isFollowUp = false;
    try {
      const { Redis: _R } = await import('@upstash/redis');
      const _r = new _R({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
      isFollowUp = !!(await _r.get(`coach-fullctx:${userId}`));
      if (isFollowUp) console.log(`[MSG] Follow-up mode: skipping journey/summary context`);
    } catch (_) {}

    // === 組合 userContext（用最近標籤取代 journey/summary，永遠反映最新狀態）===
    const contextUser = matchedPreload
      ? await getUser(userId)
      : (isIntro ? updatedUser : (user || updatedUser));
    const userContext = buildUserContext(
      contextUser,
      isFollowUp ? null : recentTags,
      profileSlices,
      activeGoal
    );

    // === 續報提示：第 1 層 confirmed_at 優先 / 第 2-5 層結業期邏輯 ===
    // 契約_續報記錄.md §4 + §10 Phase 2.1
    // 必須 if/else if 互斥結構，避免第 1 層「別提續報」疊加 first-time 的「自然帶續報」
    let contextSuffix = '';

    // 第 1 層：renewal_confirmed_at 命中 → 獨佔（跨所有 classStatus，跨 active/expired）
    if (contextUser?.renewalConfirmedAt) {
      // 若是結業期仍保留結業禁句（話術衝突必須先禁）
      if (classStatus === 'graduating' || classStatus === 'grace') {
        contextSuffix += `\n\n【重要情境：這位學員的課程已結束，目前是結業寬限期】

⚠️ 絕對禁止的說法（很重要）：
- 不可以說「隨時都可以問我」「我一直都在」「什麼時候想聊都可以」
- 不可以暗示他可以像以前一樣無限使用小幫手
- 因為結業後小幫手的服務是有限的，說了會跟實際體驗衝突`;
      }
      contextSuffix += `\n\n【這位學員已完成續報】
不要再提續報的事，正常回答問題就好。可以自然地肯定他的決定（但不用每次都提），像朋友一樣聊天。`;
      console.log(`[Renewal] ${userId?.substring(0, 8)} confirmed_at set, skip renewal prompt (layer 1)`);
    }
    // 第 2-5 層：既有結業期 alreadyRenewed / alreadyMentioned / first-time 邏輯
    else if (classStatus === 'graduating' || classStatus === 'grace') {
      // 第 2 層：renewal_intent === 'interested' 命中（契約 §4）
      // QR 點「想了解怎麼繼續」或「問助教續報方案」後寫入 — 跨 session 持久
      const intentInterested = contextUser?.renewalIntent === 'interested';

      // 第 3 層（兜底）：學員是否已說過續報 / 已經提過續報引導
      const renewalKeywords = ['續報', '繼續報', '我有報', '已經報了', '報名了', '我報了'];
      const alreadyRenewed = chatHistory.some(m =>
        m.role === 'user' && renewalKeywords.some(kw => m.content?.includes(kw))
      ) || combinedText && renewalKeywords.some(kw => combinedText.includes(kw));

      const { Redis: _Redis } = await import('@upstash/redis');
      const _rRenewal = new _Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
      const renewalMentionedKey = `coach-renewal-mentioned:${userId}`;
      const alreadyMentioned = await _rRenewal.get(renewalMentionedKey);

      contextSuffix += `\n\n【重要情境：這位學員的課程已結束，目前是結業寬限期】

⚠️ 絕對禁止的說法（很重要）：
- 不可以說「隨時都可以問我」「我一直都在」「什麼時候想聊都可以」
- 不可以暗示他可以像以前一樣無限使用小幫手
- 因為結業後小幫手的服務是有限的，說了會跟實際體驗衝突`;

      if (intentInterested) {
        // 第 2 層：QR 已表達想續的意向 → 不再提（跨 session 持久，不受 chatHistory 限制）
        contextSuffix += `\n\n這位學員已經表達想繼續的意向了。不要再提續報或推薦，正常回答問題就好。像朋友一樣聊天，可以自然地肯定他的決定。`;
        console.log(`[Graduating] ${userId?.substring(0, 8)} renewal_intent=interested, skip renewal prompt (layer 2)`);
      } else if (alreadyRenewed) {
        // 第 3 層（兜底）：chatHistory 關鍵字命中 → 不再提
        contextSuffix += `\n\n這位學員已經決定續報了。不要再提續報的事，正常回答問題就好。可以自然地肯定他的決定（但不用每次都提），像朋友一樣聊天。`;
        console.log(`[Graduating] ${userId?.substring(0, 8)} already renewed, skip renewal prompt (layer 3)`);
      } else if (alreadyMentioned) {
        // 已經提過一次續報 → 不再提
        contextSuffix += `\n\n今天已經跟這位學員提過續報了，這次不要再提。正常回答問題就好。`;
        console.log(`[Graduating] ${userId?.substring(0, 8)} renewal already mentioned today, skip`);
      } else {
        // 今天第一次對話 → 自然帶一次續報，然後記錄到當天結束
        contextSuffix += `\n\n正常回答他的問題，在最後自然帶一段話（不要生硬）：
- 點出他這幾個月已經內化的改變
- 如果想繼續有人陪著看方向，可以跟助教聊聊續報
- 不要用「上課」「學習」，用「有人陪著你」「繼續有人幫你看」
語氣像朋友關心，不是推銷。`;
        // 標記今天已提過，TTL 到台灣時間隔天 00:00
        const _now = new Date();
        const _twNow = new Date(_now.getTime() + 8 * 60 * 60 * 1000);
        const _twMid = new Date(_twNow);
        _twMid.setUTCHours(24, 0, 0, 0);
        const _ttl = Math.max(Math.floor((_twMid - _twNow) / 1000), 60);
        await _rRenewal.set(renewalMentionedKey, '1', { ex: _ttl });
        console.log(`[Graduating] ${userId?.substring(0, 8)} renewal mentioned, ttl=${_ttl}s`);
      }
    }

    // === 🔑 同主題重複偵測 → 簡短/總結模式 ===
    const repetition = detectTopicRepetition(chatHistory, combinedText);
    if (repetition.summarize) {
      contextSuffix += `\n\n[重要：用戶已經反覆問同一個主題 ${repetition.count} 次了。請主動做一個重點總結（3 點以內），然後建議她如果還擔心可以直接跟一休老師說。不要再重複解釋原理。]`;
      console.log(`[MSG] Topic repetition: summarize mode (${repetition.count}x)`);
    } else if (repetition.brief) {
      contextSuffix += `\n\n[注意：這個主題你已經解釋過了。這次直接回答她的具體問題，80 字以內，不要重複解釋原理。]`;
      console.log(`[MSG] Topic repetition: brief mode (${repetition.count}x)`);
    }

    console.log(`[MSG] ${userId?.substring(0, 8)}: "${combinedText.substring(0, 60)}", msgs: ${messages.length}, history: ${chatHistory.length}, intro: ${isIntro}, slices: ${profileSlices?.join(',') || 'all'}, context: ${userContext.length}c, followUp: ${isFollowUp}`);

    // === 設定 follow-up 旗標（30 分鐘 TTL）===
    if (!isFollowUp) {
      try {
        const { Redis: _R2 } = await import('@upstash/redis');
        const _r2 = new _R2({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
        await _r2.set(`coach-fullctx:${userId}`, '1', { ex: 1800 });
      } catch (_) {}
    }

    // === AI 回覆（用合併後的完整文字，傳入預計算的意圖）===
    // imageMarkerPrefix：若 60 秒內收過 image，前綴 marker 讓 AI 知道用戶傳了圖（避免幻覺看到照片）
    const reply = await handleMessage(imageMarkerPrefix + combinedText, chatHistory, userContext + contextSuffix, milestone, intent, userId);

    // === 場景 1：群體存在感 — 暫時停用（2026-04-17 發現問題）===
    // 停用原因：
    // 1. 欄位名不一致：Redis profile 有 className（preload）vs class_name（續報換班）兩種
    //    續報學員會中槍，新生不觸發 → 體驗不一致
    // 2. 數字=1 反效果：「今天已經有 1 位同學聊過了」= 確認孤立（玉玲 2026-04-19 案例）
    // 3. 破壞對話氛圍：結業/續報/情感深度場合尾巴接罐頭句 = AI 沒在聽
    // 重新設計需要：閾值門檻 + 場景過濾 + 欄位統一 + 話術動態

    // === 儲存對話（存合併後的完整文字）===
    await addChatMessage(userId, 'user', combinedText);
    await addChatMessage(userId, 'assistant', reply);

    // === 送出回覆 ===
    const result = await sendMessage(lastReplyToken, userId, reply);
    console.log(`[MSG] Reply sent via ${result.method} (${reply.length} chars)`);

    // === 標籤抽取 & 糾正偵測（await 確保 Vercel 不會提前終止）===
    await backgroundTagProcessing(userId, combinedText, reply).catch(err =>
      console.error('[Tags] Background error:', err)
    );

    // === 背景：私訊崩潰訊號偵測 → 通知教練 ===
    detectDistressAndNotify(userId, combinedText, contextUser).catch(err =>
      console.error('[Distress] Error:', err)
    );

  } catch (err) {
    console.error('[MSG] AI error:', err);
    await sendMessage(lastReplyToken, userId,
      '抱歉，我剛才腦袋打結了。可以再跟我說一次嗎？'
    );
  }
}

/**
 * 背景處理：標籤抽取和趨勢更新
 */
async function backgroundTagProcessing(userId, userText, aiReply) {
  try {
    const tags = await extractCoachingTags(userText, aiReply, userId);
    if (tags) {
      const totalTopics = await saveCoachingTags(userId, tags);
      console.log(`[Tags] Saved: ${tags.topic}/${tags.emotion}, total: ${totalTopics}`);

      // === 目標系統：偵測到新目標 → 只有沒有進行中目標時才儲存 ===
      if (tags.goal_action) {
        const existingGoal = await getActiveGoal(userId);
        if (!existingGoal) {
          await setGoal(userId, tags.goal_action, tags.core_issue);
          console.log(`[Goal] New goal set: ${tags.goal_action}`);
        } else {
          console.log(`[Goal] Skipped (active goal exists): ${existingGoal.goal_text}`);
        }
      }

      // === 目標系統：偵測到目標完成 → 標記完成 ===
      if (tags.goal_completed === true) {
        await completeGoal(userId);
        console.log(`[Goal] Goal completed for ${userId?.substring(0, 8)}`);
      }
    }
    // journey/summary 背景更新已停用（2026-04-03）
  } catch (err) {
    console.error('[Tags] Background processing error:', err);
  }

  // --- 🔑 糾正偵測（獨立於 tags 提取，不受 extractCoachingTags 失敗影響）---
    // Renee 蘿蔔乾事件（2026-04-08）：tags 記了蘿蔔乾，學員說「我沒吃蘿蔔乾」但 AI 繼續提。
    // 做法：① code 偵測否定詞（gate，過濾 99% 訊息）
    //       ② AI 判定「用戶在永久糾正什麼」（理解語意，不誤殺）
    //       ③ code 拿 AI 回傳的關鍵字清三層（tags + goals + Redis cache）
    try {
      // 阿算驗證過的否定詞清單（AI 層會過濾掉「好的沒問題」等非糾正）
      const NEGATION_WORDS = ['沒問題', '沒事', '不用擔心', '沒有問題', '不需要',
        '沒什麼', '沒有在', '沒有', '不是', '好了', '出院'];
      const hasNegation = NEGATION_WORDS.some(w => userText.includes(w));

      if (hasNegation) {
        // 收集系統記住的東西，讓 AI 知道上下文
        const { getSupabase } = await import('@/lib/supabase');
        const sb = getSupabase();
        const corrUser = await getUser(userId);

        // 從最近 tags + goals 組裝系統記憶
        const recentTags = await getRecentTopics(userId, 15);
        const activeGoal = await getActiveGoal(userId);
        const systemMemory = [
          recentTags.length ? `最近對話標籤：${recentTags.map(t => t.core_issue || t.tag).filter(Boolean).join('、')}` : '',
          activeGoal ? `目標：${activeGoal.goal_text}` : '',
          corrUser?.info?.goal ? `個人目標：${corrUser.info.goal}` : '',
        ].filter(Boolean).join('\n');

        if (systemMemory) {
          let matchedTopics = [];
          try {
            const aiPrompt = `用戶說：「${userText.substring(0, 200)}」

系統目前記住的：
${systemMemory}

判斷：用戶有沒有在「永久糾正」系統記錯的事？

永久糾正 = 用戶明確說某件事「根本不是事實」或「從來就沒有」。例如：
- 「我根本沒吃蘿蔔乾」= 系統以為有吃，但沒有 → ["蘿蔔乾"]
- 「膝蓋沒問題」= 系統以為有問題，但沒有 → ["膝蓋"]
- 「腎臟發炎是我爸爸的不是我的」= 系統記錯人了 → ["腎臟發炎"]

不是糾正（不要列）：
- 「今天不超慢跑」= 今天的選擇，不代表沒有這個習慣
- 「最近沒有跳舞」= 暫時沒做，但還是她的習慣
- 「好的沒問題」= 回應對方，不是糾正

只回傳被永久糾正的核心詞 JSON 陣列（2-4字）。沒有就回 []`;

            const GEMINI_KEY = process.env.GEMINI_API_KEY;
            const aiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
                  generationConfig: { temperature: 0, maxOutputTokens: 100, thinkingConfig: { thinkingBudget: 0 } },
                }),
              }
            );

            if (aiRes.ok) {
              const aiData = await aiRes.json();
              if (userId) {
                const { trackApiUsage } = await import('@/lib/cost-tracker');
                trackApiUsage(userId, 'correction_detect', 'gemini-2.5-flash-lite', aiData);
              }
              const aiText = aiData?.candidates?.[0]?.content?.parts?.filter(p => p.text).pop()?.text?.trim() || '[]';
              const jsonMatch = aiText.match(/\[[\s\S]*?\]/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed)) {
                  matchedTopics = parsed.filter(t => typeof t === 'string' && t.length >= 2);
                }
              }
            }
            console.log(`[Correction] AI detected: ${JSON.stringify(matchedTopics)}`);
          } catch (aiErr) {
            console.error('[Correction] AI detection failed (non-fatal):', aiErr.message);
          }

          // Code 清理：三層
          if (matchedTopics.length > 0) {
            // Redis 連線共用（不在迴圈內重複建立）
            let _rCorr;
            try {
              const { Redis } = await import('@upstash/redis');
              _rCorr = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
            } catch (_) {}

            for (const topic of matchedTopics) {
              console.log(`[Correction] Cleaning: "${topic}"`);

              // 1. Supabase coaching_tags：刪含關鍵字的整筆
              if (sb) {
                try {
                  const { data: deleted } = await sb.from('coaching_tags')
                    .delete()
                    .eq('user_id', userId)
                    .or(`core_issue.ilike.%${topic}%,progress_detail.ilike.%${topic}%`)
                    .select('id');
                  console.log(`[Correction] Deleted ${deleted?.length || 0} tags containing "${topic}"`);
                } catch (e) {
                  console.error(`[Correction] Tag cleanup error:`, e.message);
                }

                // 2. Supabase goals：刪含關鍵字的目標
                try {
                  await sb.from('goals')
                    .update({ status: 'replaced' })
                    .eq('user_id', userId)
                    .eq('status', 'active')
                    .ilike('goal_text', `%${topic}%`);
                } catch (e) { /* non-fatal */ }
              }
            }

            // 3. Redis cache：清一次就好（不用每個 topic 清一次）
            if (_rCorr) {
              try {
                await Promise.all([
                  _rCorr.del(`coach:${userId}:topics`),
                  _rCorr.del(`coach:${userId}:summary`),
                  _rCorr.del(`coach:${userId}:journey`),
                ]);
                console.log(`[Correction] Redis cache cleared for ${userId?.substring(0, 8)}`);
              } catch (e) { /* non-fatal */ }
            }
          }
        }
      }
    } catch (corrErr) {
      console.error('[Correction] Error (non-fatal):', corrErr.message);
    }
}

// ===== 私訊崩潰訊號偵測 =====

const DISTRESS_WORDS = ['放棄', '不想', '算了', '崩潰', '撐不下去', '做不到', '好累', '沒用', '沒效', '受不了', '暴食', '管不住', '復胖', '不敢量', '不想量', '想哭', '好難', '壓力好大', '不想繼續'];

async function detectDistressAndNotify(userId, text, user) {
  const matched = DISTRESS_WORDS.find(w => text.includes(w));
  if (!matched) return;

  const name = user?.info?.name || user?.lineDisplayName || '學員';
  const className = user?.className || '';
  const classLabel = className ? `【${className}】` : '';

  const notifyText = `🔴 私訊關注${classLabel}\n${name} 說：「${text.substring(0, 150)}」\n\n關鍵字：${matched}\n→ 查看對話：https://coach-line-bot.vercel.app/admin/students`;

  // LINE push 通知教練 + 助教（只推不存）
  const targets = [process.env.COACH_USER_ID, process.env.STAFF_USER_ID].filter(Boolean);
  for (const id of targets) {
    if (id === userId) continue; // 不通知自己
    try {
      await pushMessage(id, notifyText);
    } catch (e) {
      console.error(`[Distress] Notify failed for ${id?.substring(0, 8)}:`, e.message);
    }
  }

  console.log(`[Distress] ${name}: "${matched}" → notified ${targets.length} people`);
}

// ===== 選單觸發定義 =====

const MENU_TRIGGERS = {
  '下一餐吃什麼': {
    response: '你等一下在哪吃？😊',
    quickReply: [
      { label: '🏪 便利商店', text: '便利商店可以買什麼ABC搭配' },
      { label: '🍱 自助餐', text: '自助餐怎麼夾比較健康' },
      { label: '🥞 早餐店', text: '早餐店怎麼點比較好' },
      { label: '🍲 火鍋', text: '火鍋怎麼吃比較好' },
      { label: '🍢 滷味/鹹水雞', text: '滷味鹹水雞怎麼選比較好' },
      { label: '🍜 麵店', text: '麵店怎麼點比較好' },
      { label: '🥡 便當店', text: '便當店怎麼選比較健康' },
      { label: '🥪 Subway', text: 'Subway怎麼點比較健康' },
    ]
  },
  '這個能吃嗎': {
    response: '跟我說食物名稱，我幫你查分類和份量！\n\n或是直接點常被問的 👇',
    quickReply: [
      { label: '🌽 玉米', text: '玉米算什麼類別可以吃多少' },
      { label: '🧈 百頁豆腐', text: '百頁豆腐可以吃嗎' },
      { label: '🥛 燕麥奶', text: '燕麥奶算什麼類別' },
      { label: '🍠 地瓜', text: '地瓜算什麼份量怎麼抓' },
      { label: '🥑 酪梨', text: '酪梨算什麼類別' },
      { label: '🥟 水餃', text: '水餃可以吃幾顆' },
      { label: '🍗 雞翅', text: '雞翅可以吃嗎' },
      { label: '❓ 其他食物', text: '我想問其他食物能不能吃' },
    ]
  },
  '肚子餓了': {
    response: '你現在大概什麼時間？',
    quickReply: [
      { label: '☀️ 上午餓', text: '上午肚子餓可以吃什麼' },
      { label: '🌤️ 下午餓', text: '下午肚子餓可以吃什麼點心' },
      { label: '🌙 睡前餓', text: '睡前肚子餓怎麼辦' },
      { label: '🏢 在公司', text: '在公司肚子餓可以吃什麼' },
    ]
  },
  '經期怎麼吃': {
    response: '你現在是哪個階段？',
    quickReply: [
      { label: '😋 經前嘴饞', text: '經前很想吃甜食怎麼辦' },
      { label: '🩸 經期中', text: '生理期中飲食要注意什麼' },
      { label: '⚖️ 經期體重', text: '生理期體重上升正常嗎' },
      { label: '🏃‍♀️ 經期運動', text: '生理期可以運動嗎' },
    ]
  },
  '跟小幫手聊聊': {
    response: '有什麼想聊的嗎？不管是心態上的、飲食上的，什麼都可以 ☺️',
    quickReply: [
      { label: '😔 最近有點卡', text: '最近飲食確實有點卡關' },
      { label: '🍽️ 外食不知道怎麼選', text: '外食不知道怎麼選' },
      { label: '😤 壓力好大想吃', text: '壓力好大好想吃東西' },
      { label: '🤔 經期怎麼吃', text: '經前很想吃甜食怎麼辦' },
      { label: '💪 我有好消息', text: '我最近有一些進步想分享' },
    ]
  },
};

/**
 * 檢查是否為選單觸發文字
 * @param {string} text - 用戶訊息
 * @returns {object|null} 觸發定義或 null
 */
function getMenuTrigger(text) {
  return MENU_TRIGGERS[text] || null;
}

// ===== 續報推播 Quick Reply 回覆（框定內容）=====

// 契約_續報記錄.md §2 QR 映射表 — renewal_intent 是寫入 Supabase 的值；interest 保留向下相容
const RENEWAL_QR_RESPONSES = {
  // 第10/11週五：暖場
  '想了解怎麼繼續': {
    reply: `休校長有幫續報的同學爭取優惠方案，一個月平均不到 3000 元，名額會優先保留給你。\n\n而且續報的話，小幫手會繼續陪著你，更了解你的課程進度，幫你在過程中解決問題、陪你達成目標 ☺️\n\n有興趣的話直接到「Artemis線上減重班」官方帳號問助教，他會傳方案跟報名表給你！`,
    notifyCoach: true,
    interest: 'yes',
    renewal_intent: 'interested',
  },
  '我覺得可以自己來': {
    reply: `很棒，代表你這三個月真的有內化 💪\n\n課程結束後小幫手還是可以用的，有問題隨時來問。\n\n不過說實話，在課程中小幫手會更了解你的進度跟狀態，能更針對性地陪你。一個人維持跟有團隊陪伴，遇到卡關的時候差別真的蠻大的。\n\n如果之後改變想法，到「Artemis線上減重班」官方帳號問助教就好 ☺️`,
    notifyCoach: true,
    interest: 'maybe',
    renewal_intent: 'not_interested',
  },
  '還在想': {
    reply: `不急 ☺️ 你可以先想一件事：課程結束後，如果某天體重突然上升、或是連續幾天外食不知道怎麼選，你會怎麼做？\n\n有團隊的時候，這些都是小事。一個人的時候，就容易變成放棄的理由。\n\n想好了隨時到「Artemis線上減重班」官方帳號問助教，名額有幫你保留 ☺️`,
    notifyCoach: true,
    interest: 'thinking',
    renewal_intent: 'thinking',
  },
  // 第12週四：最後提醒
  '問助教續報方案': {
    reply: `到「Artemis線上減重班」官方帳號，跟助教說「我想了解續報方案」就好，他會傳方案跟報名表給你 ☺️\n\n續報一個月平均不到 3000 元，小幫手也會繼續陪著你！`,
    notifyCoach: true,
    interest: 'yes',
    renewal_intent: 'interested',
  },
  '續報我再想想': {
    reply: `好的 ☺️ 名額有保留著，想到的時候到「Artemis線上減重班」官方帳號問助教就好。`,
    notifyCoach: true,
    interest: 'thinking',
    renewal_intent: 'thinking',
  },
  '我有其他問題想問': {
    reply: `當然！你想問什麼都可以 ☺️`,
    notifyCoach: false,
    interest: null,
    renewal_intent: null,
  },
};

// 契約_續報記錄.md §4 唯一映射，消費端共用這張表
const INTENT_TO_LABEL = {
  interested: '想繼續 ✅',
  thinking: '還在想 💭',
  not_interested: '自己試試看 💡（可再聊聊）',
};

const INTENT_RANK = { interested: 2, thinking: 1, not_interested: 0 };

function getRenewalQRResponse(text) {
  return RENEWAL_QR_RESPONSES[text] || null;
}

/**
 * 通知教練 + 助教（LINE push，不存對話紀錄）
 *
 * 契約_續報記錄.md §4 notifyRenewalInterest 新簽名
 *
 * @param {string} studentName — 學員名稱；NULL 時由呼叫端 fallback 為 userId 前 8 字
 * @param {string} intent — renewal_intent 新值：interested / thinking / not_interested
 * @param {string} evidence — QR 固定文字或關鍵字原話
 * @param {string|null} oldIntent — 若為降級情境傳入舊值，用於組「⚠️ 意向變化」label
 */
async function notifyRenewalInterest(studentName, intent, evidence = '', oldIntent = null) {
  // 降級 = 新值序號 < 舊值序號
  const isDowngrade = oldIntent
    && INTENT_RANK[intent] !== undefined
    && INTENT_RANK[oldIntent] !== undefined
    && INTENT_RANK[intent] < INTENT_RANK[oldIntent];

  const newLabel = INTENT_TO_LABEL[intent] || intent;
  const interestLabel = isDowngrade
    ? `⚠️ 意向變化：${INTENT_TO_LABEL[oldIntent]} → ${newLabel}`
    : newLabel;

  const prefix = isDowngrade ? '【意向變化提醒】' : '';
  const evidenceLine = evidence ? `\n原話：${evidence}` : '';
  const text = `${prefix}📋 續報意願\n${studentName}：${interestLabel}${evidenceLine}\n\n→ 查看學員：https://coach-line-bot.vercel.app/admin/students`;

  const targets = [process.env.COACH_USER_ID, process.env.STAFF_USER_ID].filter(Boolean);
  for (const id of targets) {
    try {
      await pushMessage(id, text);
    } catch (e) {
      console.error(`[Renewal] Notify failed for ${id?.substring(0, 8)}:`, e.message);
    }
  }
}
