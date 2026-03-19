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

import { verifySignature, sendMessage, replyWithQuickReply, getProfile, getGroupMemberProfile, getGroupSummary } from '@/lib/line';
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
} from '@/lib/user';
import {
  extractCoachingTags, saveCoachingTags,
  shouldUpdateTrend, updateCoachingSummary,
  getCoachingSummary, checkMilestones, getTopicCount,
  shouldUpdateJourney, updateJourneySummary, getJourneySummary,
} from '@/lib/tags';
import { NextResponse } from 'next/server';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export const maxDuration = 60;

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

  // Telegram 快速通知：在主流程（HTTP response 前）掃描群組訊息關鍵字
  // 群組 AI 偵測仍在 waitUntil 背景做，但通知先用關鍵字發，確保送達
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChat) {
    const mindsetWords = ['放棄','不想','算了','崩潰','撐不下去','做不到','好累','沒用','沒效','受不了','暴食','好想吃','管不住','復胖','不敢量','不想量'];
    for (const event of events) {
      if (event.type === 'message' && event.message?.type === 'text' && event.source?.type === 'group') {
        const text = event.message.text || '';
        const matched = mindsetWords.find(w => text.includes(w));
        if (matched) {
          try {
            let name = '學員';
            try {
              const profile = await getProfile(event.source.userId);
              if (profile?.displayName) name = profile.displayName;
            } catch (_) {}
            let groupName = '';
            try {
              const gs = await getGroupSummary(event.source.groupId);
              if (gs?.groupName) groupName = `【${gs.groupName}】`;
            } catch (_) {}
            await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: tgChat,
                text: `🔴${groupName} ${name} 可能需要關注\n\n「${text.substring(0, 200)}」\n\n→ 查看後台：https://coach-line-bot.vercel.app/admin`,
              }),
            });
          } catch (_) {}
        }
      }
    }
  }

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

    if (type !== 'message') return;

    const { message } = event;

    // ===== 群組訊息：只偵測自介，不回覆 =====
    if (sourceType === 'group' || sourceType === 'room') {
      if (message.type === 'text') {
        return await handleGroupMessage(source, userId, message.text);
      }
      return; // 群組中非文字訊息忽略
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

async function handleGroupMessage(source, userId, text) {
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
  const detection = await aiDetectQuestion(trimmed, contextForDetect);
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
    const draft = await generateDraftResponse(trimmed, studentContext);
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

  let matched = false;
  let needVerify = false;

  try {
    const profile = await getProfile(userId);
    if (profile?.displayName) {
      // 先檢查是否有重名
      const isDupe = await isLinNameDuplicate(profile.displayName);
      if (isDupe) {
        // 有重名：不自動比對，要求確認姓名
        needVerify = true;
        await setPendingVerify(userId, profile.displayName);
        console.log(`[Follow] Duplicate LINE name: ${profile.displayName}, requesting verification`);
      } else {
        // 沒有重名：嘗試自動比對
        matched = await tryMatchPreloaded(userId, profile.displayName);
        if (matched) {
          console.log(`[Follow] Auto-matched preloaded intro for ${profile.displayName}`);
        } else {
          // 沒比對到（可能不在名單裡，或名稱不一樣）→ 也要求確認
          needVerify = true;
          await setPendingVerify(userId, profile.displayName);
          console.log(`[Follow] No match for ${profile.displayName}, requesting verification`);
        }
      }
    }
  } catch (err) {
    console.error('[Follow] Match error:', err);
  }

  let welcome;
  if (needVerify) {
    // 需要確認身份：先問姓名，再給正式歡迎
    welcome = `嗨！我是休校長的小幫手 🙌

歡迎加入！為了幫你建立專屬檔案，請先跟我說一下你報名時填的姓名 ☺️

（直接打名字就好，例如「王美玲」）`;
  } else {
    // 已自動比對成功：正式歡迎
    welcome = `嗨！我是休校長的小幫手 🙌

不知道下一餐怎麼搭？跟我說你平常在哪裡買（便利商店？自助餐？早餐店？），我幫你想幾個 ABC 搭配，直接照著買就好 😊

「這個能不能吃？」「玉米算澱粉嗎？」這種小問題也可以直接問我，秒回你。

課程中有任何問題也隨時來聊——不好意思在群組問的、心態有點卡的，這裡什麼都可以聊。休校長也看得到喔 ☺️`;
  }

  await sendMessage(replyToken, userId, welcome);
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

  // === 姓名確認：重名或未比對時，學員回覆姓名 ===
  const pendingVerify = await getPendingVerify(userId);
  if (pendingVerify) {
    // 學員正在回覆姓名（2-6個中文字，沒有其他複雜內容）
    const isLikelyName = /^[\u4e00-\u9fff]{2,6}$/.test(trimmed) || /^[a-zA-Z\s]{2,20}$/.test(trimmed);
    if (isLikelyName) {
      const matched = await tryMatchByRealName(userId, trimmed);
      await clearPendingVerify(userId);

      if (matched) {
        console.log(`[Verify] Matched by real name: ${trimmed}`);
        return await sendMessage(replyToken, userId,
          `找到了！歡迎你 ${trimmed} ☺️\n\n不知道下一餐怎麼搭？跟我說你平常在哪裡買（便利商店？自助餐？早餐店？），我幫你想幾個 ABC 搭配，直接照著買就好 😊\n\n「這個能不能吃？」「玉米算澱粉嗎？」這種小問題也可以直接問我。\n\n課程中有任何問題也隨時來聊，休校長也看得到喔 ☺️`
        );
      } else {
        console.log(`[Verify] No match for real name: ${trimmed}`);
        return await sendMessage(replyToken, userId,
          `沒關係！我先記住你了 ☺️\n\n不知道下一餐怎麼搭？跟我說你平常在哪裡買（便利商店？自助餐？早餐店？），我幫你想幾個 ABC 搭配，直接照著買就好 😊\n\n有任何問題隨時來聊！`
        );
      }
    }
    // 如果回覆的不像姓名（例如直接問問題），清除 pending 繼續正常流程
    await clearPendingVerify(userId);
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
async function processBatchedMessages(userId, messages) {
  // 合併所有文字（用換行連接）
  const combinedText = messages.map(m => m.text).join('\n');
  // 用最後一條的 replyToken（最新的才有效）
  const lastReplyToken = messages[messages.length - 1].replyToken;

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

    // === 檢查是否是自我介紹 ===
    let isIntro = false;
    if (looksLikeIntroduction(combinedText)) {
      isIntro = true;
      processIntroduction(userId, combinedText).catch(err =>
        console.error('[User] Intro processing error:', err)
      );
      console.log(`[Intro] Detected for ${userId?.substring(0, 8)}, processing...`);
    }

    // === 記錄互動 & 檢查里程碑 ===
    const updatedUser = await recordInteraction(userId);
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
    const intent = await classifyIntent(combinedText, recentUserMsgs);
    const profileSlices = intent?.slices || null;

    // === 組合 userContext（用 AI 選取的切片動態注入）===
    const contextUser = matchedPreload
      ? await getUser(userId)
      : (isIntro ? updatedUser : (user || updatedUser));
    const userContext = buildUserContext(contextUser, coachingSummary, journeySummary, profileSlices);

    console.log(`[MSG] ${userId?.substring(0, 8)}: "${combinedText.substring(0, 60)}", msgs: ${messages.length}, history: ${chatHistory.length}, intro: ${isIntro}, slices: ${profileSlices?.join(',') || 'all'}, context: ${userContext.length}c`);

    // === AI 回覆（用合併後的完整文字，傳入預計算的意圖）===
    const reply = await handleMessage(combinedText, chatHistory, userContext, milestone, intent);

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
    const tags = await extractCoachingTags(userText, aiReply);
    if (!tags) return;

    const totalTopics = await saveCoachingTags(userId, tags);
    console.log(`[Tags] Saved: ${tags.topic}/${tags.emotion}, total: ${totalTopics}`);

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
};

/**
 * 檢查是否為選單觸發文字
 * @param {string} text - 用戶訊息
 * @returns {object|null} 觸發定義或 null
 */
function getMenuTrigger(text) {
  return MENU_TRIGGERS[text] || null;
}
