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
import { handleMessage, basicMessageFilter, aiDetectQuestion, generateDraftResponse } from '@/lib/ai';
import { getChatHistory, addChatMessage, formatChatForGemini, addGroupMessage, getGroupContext } from '@/lib/chat';
import { classifyIntent } from '@/lib/knowledge';
import { savePendingItem } from '@/lib/pending';
import { bufferMessage, isBufferReady, consumeBuffer, BATCH_DELAY, TEXT_EXTRA_DELAY } from '@/lib/queue';
import {
  looksLikeIntroduction, processIntroduction,
  getUser, recordInteraction, buildUserContext,
  tryMatchPreloaded, isLinNameDuplicate, setPendingVerify,
  getPendingVerify, clearPendingVerify, tryMatchByRealName,
  setPendingClassSelect, getPendingClassSelect, clearPendingClassSelect,
  getActiveClassNames, getActiveGoal, setGoal, completeGoal,
  recordStreak, getStreak,
} from '@/lib/user';
import {
  extractCoachingTags, saveCoachingTags,
  shouldUpdateTrend, updateCoachingSummary,
  getCoachingSummary, checkMilestones, getTopicCount,
  shouldUpdateJourney, updateJourneySummary, getJourneySummary,
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

    // ===== 群組訊息：暫時全部跳過 [2026-03-27] =====
    if (sourceType === 'group' || sourceType === 'room') {
      return; // 群組功能暫停，待重新討論偵測邏輯
    }

    // ===== 私訊：buffer 合併後 AI 回覆 =====
    if (message.type === 'text') {
      return await bufferAndSchedule(replyToken, userId, message.text);
    }

    // 其他類型
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

  // 2. 偵測自我介紹（存入用戶資料，但不 return，繼續走 AI 偵測產生草稿）
  let isGroupIntro = false;
  if (looksLikeIntroduction(trimmed)) {
    isGroupIntro = true;
    console.log(`[Group] Self-intro detected from ${displayName} in group ${groupId?.substring(0, 8)}`);
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
    // 不 return，繼續往下走產生草稿通知教練
  }

  // 3. 基本篩選：排除明顯不是問題的短訊息（自介直接跳過篩選）
  if (!isGroupIntro && !basicMessageFilter(trimmed)) return;

  // 4. AI 判斷：帶上群組上下文
  const groupContext = await getGroupContext(groupId);
  // 排除當前這則（剛剛才存進去的最後一則）
  const contextForDetect = groupContext.slice(0, -1);
  const detection = await aiDetectQuestion(trimmed, contextForDetect, userId);
  if (!detection || !detection.isQuestion) return;

  const confidence = detection.confidence || 0;
  console.log(`[Group-Q] ${displayName}: topic=${detection.topic}, confidence=${confidence}, reason=${detection.reason}`);

  try {
    // 取得學員已知資訊（如果有）
    let studentContext = '';
    const user = await getUser(userId);
    if (user?.info) {
      const info = user.info;
      const parts = [];
      if (info.name) parts.push(`名字：${info.name}`);
      if (info.job) parts.push(`職業：${info.job}`);
      if (info.life_challenge) parts.push(`生活挑戰：${info.life_challenge}`);
      if (parts.length > 0) studentContext = parts.join('，');
    }

    // 用 AI 偵測到的分類
    const topic = detection.topic || 'other';

    // 取得群組名稱（用於後台顯示班別）
    let groupName = '';
    try {
      const summary = await getGroupSummary(groupId);
      if (summary?.groupName) groupName = summary.groupName;
    } catch (e) { /* ignore */ }

    // 產生草稿回覆
    const draft = await generateDraftResponse(trimmed, studentContext, userId);
    if (!draft) {
      console.log('[Group-Q] Draft generation failed, skipping');
      return;
    }

    // 存入待回應
    await savePendingItem({
      groupId,
      groupName,
      userId,
      studentName: displayName,
      message: trimmed,
      topic,
      confidence,
      draft,
    });

    // 推播通知教練（Telegram 優先，LINE Push 備援）
    const topicMap = { mindset: '心態', diet: '飲食', plateau: '體重停滯', emotion: '情緒', other: '問題' };
    const confidenceLabel = confidence >= 0.8 ? '🔴' : confidence >= 0.6 ? '🟡' : '⚪';
    const groupLabel = groupName ? `【${groupName}】` : '';
    const notifyText = `${confidenceLabel}${groupLabel} ${displayName} 提了${topicMap[topic] || ''}問題（信心 ${Math.round(confidence * 100)}%），草稿已備好。`;

    // Telegram 通知（免費無上限）
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
      } catch (e) {
        console.error('[Group-Q] Telegram notify error:', e);
      }
    } else {
      // Telegram 沒設定時 fallback 到 LINE Push
      const coachId = process.env.COACH_USER_ID;
      if (coachId) {
        try {
          const { pushMessage } = await import('@/lib/line');
          await pushMessage(coachId, `${notifyText}\n到後台查看：https://coach-line-bot.vercel.app/admin`);
        } catch (e) {
          console.error('[Group-Q] LINE Push notify error:', e);
        }
      }
    }

    console.log(`[Group-Q] Pending item saved: ${displayName} (${topic}, ${Math.round(confidence * 100)}%)`);
  } catch (err) {
    console.error('[Group-Q] Processing error:', err);
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
  const renewalReply = getRenewalQRResponse(trimmed);
  if (renewalReply) {
    console.log(`[Renewal] ${userId?.substring(0, 8)}: "${trimmed}"`);
    await sendMessage(replyToken, userId, renewalReply.reply);

    // 通知教練 + 助教（只推不存，不污染對話紀錄）
    if (renewalReply.notifyCoach) {
      let studentName = '同學';
      try {
        const u = await getUser(userId);
        studentName = u?.info?.name || u?.lineDisplayName || '同學';
      } catch (_) {}
      notifyRenewalInterest(studentName, renewalReply.interest).catch(err =>
        console.error('[Renewal] Notify error:', err)
      );
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
    const answered = await redis.smembers(QUIZ_KEY(userId)) || [];
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
  { pattern: /^[\s]*[👍❤️💪🙏😊👏🔥💕🥰😍😘🫶✨⭐️🌟]+[\s]*$/, replies: ['😊', '💪', '❤️'] },
];

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

  try {
    // === 並行載入：對話歷史 + 用戶資料 + 心態摘要 + 旅程摘要 ===
    const [rawHistory, user, coachingSummary, journeySummary] = await Promise.all([
      getChatHistory(userId),
      getUser(userId),
      getCoachingSummary(userId),
      getJourneySummary(userId),
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

    // === 組合 userContext（用 AI 選取的切片動態注入 + 目標）===
    const contextUser = matchedPreload
      ? await getUser(userId)
      : (isIntro ? updatedUser : (user || updatedUser));
    const userContext = buildUserContext(contextUser, coachingSummary, journeySummary, profileSlices, activeGoal);

    console.log(`[MSG] ${userId?.substring(0, 8)}: "${combinedText.substring(0, 60)}", msgs: ${messages.length}, history: ${chatHistory.length}, intro: ${isIntro}, slices: ${profileSlices?.join(',') || 'all'}, context: ${userContext.length}c`);

    // === AI 回覆（用合併後的完整文字，傳入預計算的意圖）===
    const reply = await handleMessage(combinedText, chatHistory, userContext, milestone, intent, userId);

    // === 儲存對話（存合併後的完整文字）===
    await addChatMessage(userId, 'user', combinedText);
    await addChatMessage(userId, 'assistant', reply);

    // === 送出回覆 ===
    const result = await sendMessage(lastReplyToken, userId, reply);
    console.log(`[MSG] Reply sent via ${result.method} (${reply.length} chars)`);

    // === 背景：標籤抽取 & 趨勢更新 ===
    backgroundTagProcessing(userId, combinedText, reply).catch(err =>
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
    if (!tags) return;

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

    if (await shouldUpdateTrend(userId)) {
      console.log(`[Tags] Triggering trend update at ${totalTopics} topics`);
      await updateCoachingSummary(userId);
    }

    if (await shouldUpdateJourney(userId)) {
      console.log(`[Tags] Triggering journey update at ${totalTopics} topics`);
      await updateJourneySummary(userId);
    }
  } catch (err) {
    console.error('[Tags] Background processing error:', err);
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

const RENEWAL_QR_RESPONSES = {
  // 第11週五：暖場
  '想了解怎麼繼續': {
    reply: `休校長有幫續報的同學爭取優惠方案，一個月平均不到 3000 元，名額會優先保留給你。\n\n而且續報的話，小幫手會繼續陪著你，更了解你的課程進度，幫你在過程中解決問題、陪你達成目標 ☺️\n\n有興趣的話直接到「Artemis線上減重班」官方帳號問助教，他會傳方案跟報名表給你！`,
    notifyCoach: true,
    interest: 'yes',
  },
  '我覺得可以自己來': {
    reply: `很棒，代表你這三個月真的有內化 💪\n\n課程結束後小幫手還是可以用的，有問題隨時來問。\n\n不過說實話，在課程中小幫手會更了解你的進度跟狀態，能更針對性地陪你。一個人維持跟有團隊陪伴，遇到卡關的時候差別真的蠻大的。\n\n如果之後改變想法，到「Artemis線上減重班」官方帳號問助教就好 ☺️`,
    notifyCoach: true,
    interest: 'maybe',
  },
  '還在想': {
    reply: `不急 ☺️ 你可以先想一件事：課程結束後，如果某天體重突然上升、或是連續幾天外食不知道怎麼選，你會怎麼做？\n\n有團隊的時候，這些都是小事。一個人的時候，就容易變成放棄的理由。\n\n想好了隨時到「Artemis線上減重班」官方帳號問助教，名額有幫你保留 ☺️`,
    notifyCoach: true,
    interest: 'thinking',
  },
  // 第12週四：最後提醒
  '問助教續報方案': {
    reply: `到「Artemis線上減重班」官方帳號，跟助教說「我想了解續報方案」就好，他會傳方案跟報名表給你 ☺️\n\n續報一個月平均不到 3000 元，小幫手也會繼續陪著你！`,
    notifyCoach: true,
    interest: 'yes',
  },
  '續報我再想想': {
    reply: `好的 ☺️ 名額有保留著，想到的時候到「Artemis線上減重班」官方帳號問助教就好。`,
    notifyCoach: true,
    interest: 'thinking',
  },
  '我有其他問題想問': {
    reply: `當然！你想問什麼都可以 ☺️`,
    notifyCoach: false,
    interest: null,
  },
};

function getRenewalQRResponse(text) {
  return RENEWAL_QR_RESPONSES[text] || null;
}

/**
 * 通知教練 + 助教（LINE push，不存對話紀錄）
 */
async function notifyRenewalInterest(studentName, interest) {
  const interestMap = {
    yes: '想繼續 ✅',
    maybe: '在考慮 🤔',
    thinking: '還在想 💭',
    no: '不需要了',
  };

  const text = `📋 續報意願\n${studentName}：${interestMap[interest] || interest}\n\n→ 查看學員：https://coach-line-bot.vercel.app/admin/students`;

  const targets = [process.env.COACH_USER_ID, process.env.STAFF_USER_ID].filter(Boolean);
  for (const id of targets) {
    try {
      await pushMessage(id, text);
    } catch (e) {
      console.error(`[Renewal] Notify failed for ${id?.substring(0, 8)}:`, e.message);
    }
  }
}
