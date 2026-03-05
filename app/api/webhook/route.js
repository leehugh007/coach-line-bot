/**
 * LINE Webhook — 休校長小幫手
 *
 * v2：加入對話記憶、心態標籤、學員個人檔案
 *
 * 流程：
 * 1. 驗證簽名，回覆 HTTP 200
 * 2. 文字訊息 → 檢查自介 → 載入用戶資料 → Gemini AI 回覆 → 背景存標籤
 * 3. 非文字訊息 → 友善提示
 */

import { verifySignature, sendMessage } from '@/lib/line';
import { handleMessage } from '@/lib/ai';
import { getChatHistory, addChatMessage, formatChatForGemini } from '@/lib/chat';
import { looksLikeIntroduction, processIntroduction, getUser, recordInteraction, buildUserContext } from '@/lib/user';
import { extractCoachingTags, saveCoachingTags, shouldUpdateTrend, updateCoachingSummary, getCoachingSummary, checkMilestones, getTopicCount } from '@/lib/tags';
import { NextResponse } from 'next/server';

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

    // 加好友
    if (type === 'follow') {
      return await handleFollow(replyToken, userId);
    }

    if (type !== 'message') return;

    const { message } = event;

    // 文字訊息 → AI 回覆
    if (message.type === 'text') {
      return await handleTextMessage(replyToken, userId, message.text);
    }

    // 其他類型
    return await sendMessage(replyToken, userId,
      '嗨！我是休校長小幫手，目前主要用文字跟你聊天。有什麼心態上的問題或飲食上的困擾，都可以直接打字跟我說！'
    );

  } catch (err) {
    console.error('Event error:', err);
  }
}

async function handleFollow(replyToken, userId) {
  console.log('[Follow] New user:', userId?.substring(0, 8));

  const welcome = `歡迎加入！我是休校長小幫手 🙌

我是一休教練的 AI 助手，可以陪你聊聊減肥旅程中遇到的心態問題、飲食困擾。

不管是「今天又吃太多了怎麼辦」、「體重卡住了好焦慮」、還是「被家人說胖很難過」，都可以跟我聊聊。

如果你方便的話，也可以先做個簡單的自我介紹（年齡、職業、目前的狀況），這樣我可以給你更針對性的建議！

記住一休常說的：「瘦是健康的附加價值。當你變健康了，瘦就是自然而然的事！」

有什麼想聊的，隨時開口！`;

  await sendMessage(replyToken, userId, welcome);
}

async function handleTextMessage(replyToken, userId, text) {
  const trimmed = text.trim();

  // 簡單問候
  if (['你好', 'hi', 'hello', '嗨', '哈囉'].includes(trimmed.toLowerCase())) {
    return await sendMessage(replyToken, userId,
      '你好！我是休校長小幫手，有什麼想聊的嗎？不管是心態上的卡關還是飲食上的疑問，都可以跟我說！'
    );
  }

  // 使用說明
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

  try {
    // === 並行載入：對話歷史 + 用戶資料 + 心態摘要 ===
    const [rawHistory, user, coachingSummary] = await Promise.all([
      getChatHistory(userId),
      getUser(userId),
      getCoachingSummary(userId),
    ]);

    const chatHistory = formatChatForGemini(rawHistory);

    // === 檢查是否是自我介紹 ===
    let isIntro = false;
    if (looksLikeIntroduction(trimmed)) {
      isIntro = true;
      // 背景處理自介，不阻塞回覆
      processIntroduction(userId, trimmed).catch(err =>
        console.error('[User] Intro processing error:', err)
      );
      console.log(`[Intro] Detected for ${userId?.substring(0, 8)}, processing...`);
    }

    // === 記錄互動 & 檢查里程碑 ===
    const updatedUser = await recordInteraction(userId);
    const totalInteractions = updatedUser?.stats?.totalInteractions || 0;
    const totalTopics = await getTopicCount(userId);

    let milestone = null;
    if (totalTopics > 0) {
      milestone = await checkMilestones(userId, totalTopics);
    }

    // === 組合 userContext ===
    const contextUser = isIntro ? updatedUser : (user || updatedUser);
    const userContext = buildUserContext(contextUser, coachingSummary);

    console.log(`[MSG] ${userId?.substring(0, 8)}: "${trimmed.substring(0, 50)}", history: ${chatHistory.length}, intro: ${isIntro}, context: ${userContext.length}c`);

    // === AI 回覆 ===
    const reply = await handleMessage(trimmed, chatHistory, userContext, milestone);

    // === 儲存對話 ===
    await addChatMessage(userId, 'user', trimmed);
    await addChatMessage(userId, 'assistant', reply);

    // === 送出回覆 ===
    const result = await sendMessage(replyToken, userId, reply);
    console.log(`[MSG] Reply sent via ${result.method} (${reply.length} chars)`);

    // === 背景：標籤抽取 & 趨勢更新（不阻塞回覆） ===
    backgroundTagProcessing(userId, trimmed, reply).catch(err =>
      console.error('[Tags] Background error:', err)
    );

  } catch (err) {
    console.error('[MSG] AI error:', err);
    await sendMessage(replyToken, userId,
      '抱歉，我剛才腦袋打結了。可以再跟我說一次嗎？'
    );
  }
}

/**
 * 背景處理：標籤抽取和趨勢更新
 * 不阻塞主要的回覆流程
 */
async function backgroundTagProcessing(userId, userText, aiReply) {
  try {
    // 抽取標籤
    const tags = await extractCoachingTags(userText, aiReply);
    if (!tags) return;

    // 存入 Redis
    const totalTopics = await saveCoachingTags(userId, tags);
    console.log(`[Tags] Saved: ${tags.topic}/${tags.emotion}, total: ${totalTopics}`);

    // 檢查是否該更新趨勢
    if (await shouldUpdateTrend(userId)) {
      console.log(`[Tags] Triggering trend update at ${totalTopics} topics`);
      await updateCoachingSummary(userId);
    }
  } catch (err) {
    console.error('[Tags] Background processing error:', err);
  }
}
