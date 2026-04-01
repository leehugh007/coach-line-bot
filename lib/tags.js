/**
 * 心態輔導標籤系統
 *
 * 每次對話後，從 AI 回覆中抽取心態標籤存入 Redis。
 * 累積到第 5、10、15... 次時，觸發趨勢分析，產出用戶摘要。
 * 用戶摘要注入到 System Prompt 的 userContext，實現漸進式個人化。
 *
 * 資料結構：
 *   coach:{userId}:topics     → 最近 20 筆對話標籤（List / FIFO）
 *   coach:{userId}:milestones → 已觸發的里程碑（Set）
 *   coach:{userId}:summary    → 用戶近況摘要（100-200 字，每 5 次更新）
 *   coach:{userId}:journey    → 用戶旅程摘要（500-800 字，每 10 次更新，累積式）
 */

import { Redis } from '@upstash/redis';
import { getSupabase } from './supabase.js';
import { trackApiUsage } from './cost-tracker.js';

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return redis;
}

// 標籤：純 JSON 提取，不需要推理能力，用最便宜的穩定模型
const TAGS_MODEL = 'gemini-2.5-flash-lite';

/**
 * Claude Haiku 呼叫（用於摘要/旅程等高品質寫作任務，Gemini fallback）
 */
async function callClaudeHaiku(prompt, userId, callType) {
  const key = process.env.CLAUDE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { console.warn(`[Claude] ${callType} failed:`, res.status); return null; }
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim();
    if (!text) return null;
    const usage = data.usage || {};
    if (userId) trackApiUsage(userId, callType, 'claude-haiku-4.5', {
      usageMetadata: { promptTokenCount: usage.input_tokens || 0, candidatesTokenCount: usage.output_tokens || 0, thoughtsTokenCount: 0, totalTokenCount: (usage.input_tokens || 0) + (usage.output_tokens || 0) },
    });
    console.log(`[Claude] ${callType} OK: ${text.length} chars`);
    return text;
  } catch (err) { console.warn(`[Claude] ${callType} error:`, err.message); return null; }
}

function getTagsApiUrl() {
  const key = process.env.GEMINI_API_KEY;
  return `https://generativelanguage.googleapis.com/v1beta/models/${TAGS_MODEL}:generateContent?key=${key}`;
}

// ====== Redis Keys ======

const TOPICS_KEY = (uid) => `coach:${uid}:topics`;
const MILESTONES_KEY = (uid) => `coach:${uid}:milestones`;
const SUMMARY_KEY = (uid) => `coach:${uid}:summary`;
const JOURNEY_KEY = (uid) => `coach:${uid}:journey`;

const MAX_TOPICS = 20;
const TREND_INTERVAL = 15; // 每 15 次對話觸發趨勢更新（約 5 天）
const JOURNEY_INTERVAL = 10;

// ====== 1. 從對話中抽取心態標籤 ======

/**
 * 從心態輔導對話中抽取結構化標籤
 *
 * @param {string} userText - 用戶的訊息
 * @param {string} aiResponse - AI 的回覆
 * @returns {object|null} 對話標籤 JSON
 */
export async function extractCoachingTags(userText, aiResponse, userId = null) {
  const prompt = `你是一個標籤抽取器。根據以下的心態輔導對話，抽取結構化標籤。

只輸出 JSON，不要輸出任何其他文字。

JSON 格式：
{
  "topic": "mindset" | "diet_question" | "plateau" | "binge" | "external_judgment" | "motivation" | "goal_setting" | "habit" | "emotion" | "other",
  "emotion": "frustrated" | "anxious" | "guilty" | "sad" | "confused" | "positive" | "hopeful" | "neutral",
  "intensity": "mild" | "moderate" | "strong",
  "core_issue": "一句話摘要這次對話的具體內容（要有細節，例如「問水果能不能吃，糾結草莓藍莓糖分」而不是「飲食困惑」）",
  "progress_signal": "positive" | "neutral" | "struggling",
  "progress_detail": "如果 progress_signal 是 positive，用「你」的角度寫一句話記錄具體的身體或生活改變。只記錄真實的身體變化、習慣改變、別人的反饋（例如「褲頭變鬆了」「精神變好下午不會想睡」「外食會自動先點菜」「有人說你瘦了」「體重降了2公斤」）。不要記錄知識問答表現或學習成果（例如「能回答食物分類」這類不算進步）。如果不是 positive 或沒有具體身體/生活改變就填 null",
  "conversation_style": "asking" | "sharing" | "discussing" | "reflecting",
  "goal_action": "如果 AI 在回覆中提出了一個具體的行動建議，而且學員表示同意（回「好」「可以」「試試看」「我試」等），用一句話記錄這個行動目標（例如「這週正餐先把菜和蛋白質吃夠」「明天早餐試一次先吃蛋再吃其他的」「這週外食先選有菜有肉的便當」）。只記錄學員同意要去做的具體行動，不記錄一般飲食問答。如果沒有明確的行動承諾就填 null",
  "goal_completed": "如果學員主動回報之前設定的目標有做到（「我有做到」「我這週都有先吃菜」「我試了，真的比較不餓」），填 true。否則填 false"
}

topic 判定：
- "mindset"：心態調整（自責、完美主義、放棄念頭）
- "diet_question"：飲食觀念問題（怎麼吃、份量、外食）
- "plateau"：停滯期焦慮
- "binge"：暴食或破戒
- "external_judgment"：被別人評價而受傷
- "motivation"：動力不足、想放棄
- "goal_setting"：目標設定相關
- "habit"：習慣養成
- "emotion"：純情緒抒發
- "other"：其他

progress_signal 判定：
- "positive"：語氣中有進步跡象（「我今天有做到」「比之前好」）
- "neutral"：一般詢問
- "struggling"：明顯在掙扎中

conversation_style 判定：
- "asking"：主要是提問、尋求建議
- "sharing"：分享自己的經驗、成果、飲食內容
- "discussing"：互相討論觀點、交換看法（不一定是學生問老師的模式）
- "reflecting"：反思、內省、表達感悟

用戶說：「${userText.substring(0, 300)}」
AI 回覆：「${aiResponse.substring(0, 300)}」`;

  try {
    const response = await fetch(getTagsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (userId) trackApiUsage(userId, 'extract_coaching_tags', TAGS_MODEL, data);
    const textPart = data?.candidates?.[0]?.content?.parts?.find(p => p.text);
    if (!textPart) return null;

    const tags = JSON.parse(textPart.text);
    console.log('[Tags] Coaching:', tags.topic, tags.emotion, tags.progress_signal);
    return tags;

  } catch (err) {
    console.error('[Tags] Extract error:', err);
    return null;
  }
}

// ====== 2. Redis 儲存 ======

/**
 * 存入一筆對話標籤（Redis + Supabase 雙寫）
 * @returns {number} 目前累積對話數
 */
export async function saveCoachingTags(userId, tags) {
  try {
    const r = getRedis();
    const key = TOPICS_KEY(userId);

    const record = {
      ...tags,
      date: new Date().toISOString(),
    };

    await r.rpush(key, JSON.stringify(record));

    const len = await r.llen(key);
    if (len > MAX_TOPICS) {
      await r.ltrim(key, len - MAX_TOPICS, -1);
    }

    // 非阻塞寫入 Supabase
    syncTagToSupabase(userId, tags).catch(err =>
      console.error('[Tags] Supabase sync error:', err)
    );

    return Math.min(len, MAX_TOPICS);
  } catch (err) {
    console.error('[Tags] save error:', err);
    return 0;
  }
}

/**
 * 同步標籤到 Supabase
 */
async function syncTagToSupabase(userId, tags) {
  const sb = getSupabase();
  if (!sb) return;

  const { error } = await sb.from('coaching_tags').insert({
    user_id: userId,
    tag: `${tags.topic}:${tags.emotion}:${tags.progress_signal}:${tags.conversation_style || 'asking'}`,
    source: 'intent',
    core_issue: tags.core_issue || null,
    progress_detail: tags.progress_detail || null,
  });
  if (error) console.error('[Tags] Supabase insert error:', error.message);
}

/**
 * 取得最近 N 筆對話標籤（Redis 優先，miss 時從 Supabase 回補）
 */
export async function getRecentTopics(userId, count = 10) {
  try {
    const r = getRedis();
    const items = await r.lrange(TOPICS_KEY(userId), -count, -1);
    if (items && items.length > 0) {
      return items.map(item => typeof item === 'string' ? JSON.parse(item) : item);
    }

    // Redis miss → 從 Supabase 回補
    return await restoreTopicsFromSupabase(userId, count);
  } catch (err) {
    return [];
  }
}

/**
 * 從 Supabase 恢復標籤到 Redis
 */
async function restoreTopicsFromSupabase(userId, count) {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('coaching_tags')
      .select('tag, core_issue, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_TOPICS);

    if (error || !data || data.length === 0) return [];

    // 解析 tag 格式 "topic:emotion:progress_signal:conversation_style"
    const records = data.reverse().map(row => {
      const parts = (row.tag || '').split(':');
      return {
        topic: parts[0] || 'other',
        emotion: parts[1] || 'neutral',
        progress_signal: parts[2] || 'neutral',
        conversation_style: parts[3] || 'asking',
        core_issue: row.core_issue || null,
        date: row.created_at,
      };
    });

    // 回寫 Redis
    const r = getRedis();
    const key = TOPICS_KEY(userId);
    for (const record of records) {
      await r.rpush(key, JSON.stringify(record));
    }

    console.log(`[Tags] Restored ${records.length} tags from Supabase for ${userId?.substring(0, 8)}`);
    return records.slice(-count);
  } catch (err) {
    console.error('[Tags] restoreTopicsFromSupabase error:', err);
    return [];
  }
}

/**
 * 取得對話總數（Redis 優先，miss 時查 Supabase）
 */
export async function getTopicCount(userId) {
  try {
    const redisCount = await getRedis().llen(TOPICS_KEY(userId));
    if (redisCount > 0) return redisCount;

    // Redis miss → 查 Supabase
    const sb = getSupabase();
    if (!sb) return 0;

    const { count, error } = await sb
      .from('coaching_tags')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    return (error ? 0 : count) || 0;
  } catch (err) {
    return 0;
  }
}

// ====== 3. 趨勢分析 & 用戶摘要 ======

/**
 * 檢查是否該觸發趨勢更新（每 15 次對話 + 每天最多 1 次）
 */
export async function shouldUpdateTrend(userId) {
  const count = await getTopicCount(userId);
  if (!(count > 0 && count % TREND_INTERVAL === 0)) return false;

  // 每天最多更新 1 次（台灣時間），跟 journey 同 pattern
  try {
    const r = getRedis();
    const todayTW = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    const key = `coach-summary-updated:${userId}`;
    const lastUpdate = await r.get(key);
    if (lastUpdate === todayTW) return false;
    await r.set(key, todayTW, { ex: 172800 });
  } catch (_) {}
  return true;
}

/**
 * 趨勢分析：讀取最近對話標籤，用 AI 產出用戶心態摘要
 */
export async function updateCoachingSummary(userId) {
  const topics = await getRecentTopics(userId, 15);
  if (topics.length === 0) return null;

  // 統計話題
  const topicStats = topics.reduce((acc, t) => {
    acc[t.topic || 'unknown'] = (acc[t.topic || 'unknown'] || 0) + 1;
    return acc;
  }, {});

  // 統計情緒
  const emotionStats = topics.reduce((acc, t) => {
    acc[t.emotion || 'unknown'] = (acc[t.emotion || 'unknown'] || 0) + 1;
    return acc;
  }, {});

  // 統計進展信號
  const progressStats = topics.reduce((acc, t) => {
    acc[t.progress_signal || 'unknown'] = (acc[t.progress_signal || 'unknown'] || 0) + 1;
    return acc;
  }, {});

  // 核心問題清單
  const coreIssues = topics.map(t => t.core_issue).filter(Boolean);

  const prompt = `你是一位心態教練助手。根據以下用戶最近 ${topics.length} 次對話的標籤數據，產出一段用戶心態摘要（100-200字中文）。

這段摘要會讓 AI 心態教練更了解這位學員，給出個人化建議。

用客觀描述 + 趨勢判斷的方式寫。重點：
1. 主要困擾的話題是什麼
2. 情緒狀態趨勢（越來越好？反覆？持續低迷？）
3. 進展信號（有沒有正向改變的跡象）
4. 需要特別關注的心態卡點
5. 這位學員最需要什麼樣的支持

數據：
話題分布：${JSON.stringify(topicStats)}
情緒分布：${JSON.stringify(emotionStats)}
進展信號：${JSON.stringify(progressStats)}
核心問題：${coreIssues.slice(-5).join('、')}

只輸出摘要文字，不要加標題或格式符號。`;

  try {
    // Flash Lite 直接產（AI 讀的中間產物，不需要高品質寫作）
    const response = await fetch(getTagsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    trackApiUsage(userId, 'update_coach_summary', TAGS_MODEL, data);
    const textPart = data?.candidates?.[0]?.content?.parts?.find(p => p.text);
    if (!textPart) return null;
    const summary = textPart.text.trim();

    await getRedis().set(SUMMARY_KEY(userId), summary);
    console.log(`[Tags] Coach summary updated: ${summary.substring(0, 60)}...`);
    return summary;

  } catch (err) {
    console.error('[Tags] Summary error:', err);
    return null;
  }
}

/**
 * 取得用戶心態摘要（Redis 優先，miss 時嘗試從 Supabase 標籤重新生成）
 */
export async function getCoachingSummary(userId) {
  try {
    const cached = await getRedis().get(SUMMARY_KEY(userId));
    if (cached) return cached;

    // Redis miss → 如果 Supabase 有標籤，重新生成摘要
    const topics = await getRecentTopics(userId, 15);
    if (topics.length >= 3) {
      console.log(`[Tags] Summary cache miss, regenerating from ${topics.length} tags...`);
      return await updateCoachingSummary(userId);
    }
    return null;
  } catch (err) {
    return null;
  }
}

// ====== 3.5 旅程摘要（長期累積式） ======

/**
 * 檢查是否該觸發旅程摘要更新（每 10 次對話 + 每天最多 1 次）
 */
export async function shouldUpdateJourney(userId) {
  const count = await getTopicCount(userId);
  if (!(count >= JOURNEY_INTERVAL && count % JOURNEY_INTERVAL === 0)) return false;

  // 每天最多更新 1 次（台灣時間）
  try {
    const r = getRedis();
    const todayTW = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    const key = `coach-journey-updated:${userId}`;
    const lastUpdate = await r.get(key);
    if (lastUpdate === todayTW) return false;
    // 標記今天已更新（TTL 48hr，自動清理）
    await r.set(key, todayTW, { ex: 172800 });
  } catch (_) {}
  return true;
}

/**
 * 更新旅程摘要：讀取上一版旅程 + 最近標籤 + 最近對話 → AI 產出新版旅程
 * 每次都建立在上一版的基礎上，所以故事越寫越完整
 */
export async function updateJourneySummary(userId) {
  // 動態 import chat 模組取得實際對話內容
  const { getChatHistory } = await import('./chat.js');

  const [previousJourney, topics, recentSummary, recentChats] = await Promise.all([
    getJourneySummary(userId),
    getRecentTopics(userId, 20),
    getCoachingSummary(userId),
    getChatHistory(userId),
  ]);

  if (topics.length === 0) return null;

  // 取最近 10 則對話的核心問題做為具體素材
  const coreIssues = topics.map(t => t.core_issue).filter(Boolean);
  const topicDetails = topics.map(t => {
    const style = t.conversation_style ? `[${t.conversation_style}]` : '';
    return `${t.topic}(${t.progress_signal})${style} — ${t.core_issue || '無摘要'}`;
  }).join('\n');

  // 取得里程碑
  const r = getRedis();
  const milestones = await r.smembers(MILESTONES_KEY(userId)) || [];

  const totalCount = await getTopicCount(userId);

  // 從實際對話中取最近的交談片段（最多取最近 10 輪，每則截斷 150 字）
  const chatSnippets = (recentChats || [])
    .slice(-20)
    .map(msg => `[${msg.role === 'assistant' ? 'AI' : '學員'}] ${msg.content?.substring(0, 150)}`)
    .join('\n');

  const previousSection = previousJourney
    ? `\n\n【上一版旅程摘要】（在這個基礎上更新，保留重要的歷程，加入新的發展）：\n${previousJourney}`
    : '\n\n這是第一版旅程摘要，從零開始寫。';

  const prompt = `你是一位心態教練助手。請為這位學員撰寫或更新「旅程摘要」。

旅程摘要的目的：讓 AI 教練在未來的每一次對話中，都能了解這位學員從開始到現在的完整故事。

⚠️ 最重要的規則：
- 只能寫「實際對話內容」和「標籤資料」中出現的事情
- 絕對不能推測、腦補、或編造沒有在資料中出現的細節
- 如果資料不足以判斷某個面向，就不要寫那個面向
- 寧可寫短也不要編故事

撰寫原則：
1. 基於事實：每一句描述都要能在下方的「實際對話片段」或「標籤」中找到依據
2. 記錄具體內容：「問了水果能不能吃，擔心糖分」比「有飲食方面的疑慮」好
3. 注意對話風格：學員可能是提問、分享經驗、互相討論、或反思心得，不一定是「學生問老師」的模式
4. 保持客觀：像在寫學員檔案，不加主觀解讀
5. 300-600 字（資料少就寫短，不要硬湊）${previousSection}

【最近對話趨勢（近況摘要）】：
${recentSummary || '無'}

【最近 ${topics.length} 次對話標籤 + 核心問題】：
${topicDetails}

【實際對話片段（最重要的事實依據）】：
${chatSnippets || '無'}

【已達成里程碑】：${milestones.length > 0 ? milestones.join('、') : '無'}

【總對話次數】：${totalCount}

只輸出旅程摘要文字，不要加標題或格式符號。`;

  try {
    // Flash Lite 直接產（AI 讀的中間產物，不需要高品質寫作）
    const response = await fetch(getTagsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    trackApiUsage(userId, 'update_coach_journey', TAGS_MODEL, data);
    const textPart = data?.candidates?.[0]?.content?.parts?.find(p => p.text);
    if (!textPart) return null;
    const journey = textPart.text.trim();

    // 存 Redis
    await getRedis().set(JOURNEY_KEY(userId), journey);

    // 存 Supabase（永久）
    syncJourneyToSupabase(userId, journey).catch(err =>
      console.error('[Tags] Journey Supabase sync error:', err)
    );

    console.log(`[Tags] Journey updated (${journey.length} chars): ${journey.substring(0, 80)}...`);
    return journey;

  } catch (err) {
    console.error('[Tags] Journey update error:', err);
    return null;
  }
}

/**
 * 同步旅程摘要到 Supabase users.journey
 */
async function syncJourneyToSupabase(userId, journey) {
  const sb = getSupabase();
  if (!sb) return;

  const { error } = await sb
    .from('users')
    .update({ journey })
    .eq('id', userId);
  if (error) console.error('[Tags] Journey Supabase update error:', error.message);
}

/**
 * 取得旅程摘要（Redis → Supabase fallback）
 */
export async function getJourneySummary(userId) {
  try {
    const cached = await getRedis().get(JOURNEY_KEY(userId));
    if (cached) return cached;

    // Redis miss → 從 Supabase 讀
    const sb = getSupabase();
    if (!sb) return null;

    const { data, error } = await sb
      .from('users')
      .select('journey')
      .eq('id', userId)
      .single();

    if (error || !data?.journey) return null;

    // 回寫 Redis
    await getRedis().set(JOURNEY_KEY(userId), data.journey);
    console.log(`[Tags] Journey restored from Supabase for ${userId?.substring(0, 8)}`);
    return data.journey;
  } catch (err) {
    return null;
  }
}

// ====== 4. 里程碑偵測 ======

export async function checkMilestones(userId, totalConversations) {
  const r = getRedis();
  const key = MILESTONES_KEY(userId);
  const triggered = await r.smembers(key) || [];
  const triggeredSet = new Set(triggered);

  const milestones = [];

  if (totalConversations === 5 && !triggeredSet.has('chat_5')) {
    milestones.push({
      id: 'chat_5',
      text: '你已經跟我聊了 5 次了！每一次願意說出來，都是在照顧自己，很棒 💪',
    });
  }

  if (totalConversations === 10 && !triggeredSet.has('chat_10')) {
    milestones.push({
      id: 'chat_10',
      text: '第 10 次對話了！你知道嗎，願意持續面對自己的人，通常都能走得最遠',
    });
  }

  if (totalConversations === 30 && !triggeredSet.has('chat_30')) {
    milestones.push({
      id: 'chat_30',
      text: '30 次了！你跟一開始的自己相比，一定有很大的不同。我都看在眼裡',
    });
  }

  // 連續 3 次正向信號
  if (totalConversations >= 5 && !triggeredSet.has('positive_streak')) {
    const recent = await getRecentTopics(userId, 3);
    if (recent.length >= 3 && recent.every(t => t.progress_signal === 'positive')) {
      milestones.push({
        id: 'positive_streak',
        text: '最近幾次聊天都感覺到你在進步！這股正向的力量，會帶著你繼續往前',
      });
    }
  }

  if (milestones.length > 0) {
    for (const m of milestones) {
      await r.sadd(key, m.id);
    }

    // 非阻塞寫入 Supabase
    syncMilestoneToSupabase(userId, milestones[0]).catch(err =>
      console.error('[Tags] Milestone Supabase sync error:', err)
    );
  }

  return milestones.length > 0 ? milestones[0].text : null;
}

/**
 * 同步里程碑到 Supabase
 */
async function syncMilestoneToSupabase(userId, milestone) {
  const sb = getSupabase();
  if (!sb) return;

  const typeMap = {
    chat_5: 'habit', chat_10: 'habit', chat_30: 'habit',
    positive_streak: 'mindset',
  };

  const { error } = await sb.from('milestones').insert({
    user_id: userId,
    type: typeMap[milestone.id] || 'habit',
    content: milestone.text,
  });
  if (error) console.error('[Tags] Milestone insert error:', error.message);
}

// ====== 5. 關係階段判定 ======

export function getRelationshipStage(totalInteractions) {
  if (totalInteractions <= 3) return { stage: '初見', desc: '溫暖的陪伴者：傾聽、理解、建立信任' };
  if (totalInteractions <= 10) return { stage: '熟悉', desc: '認識你的朋友：開始引用過去對話的脈絡' };
  if (totalInteractions <= 30) return { stage: '信任', desc: '懂你的教練：針對個人弱點重點支持' };
  return { stage: '夥伴', desc: '一起走的同伴：見證成長、長期陪伴' };
}
