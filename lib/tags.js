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
 *   coach:{userId}:summary    → 用戶摘要（自然語言，100-200 字）
 */

import { Redis } from '@upstash/redis';

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

const TAGS_MODEL = 'gemini-2.5-flash';

function getTagsApiUrl() {
  const key = process.env.GEMINI_API_KEY;
  return `https://generativelanguage.googleapis.com/v1beta/models/${TAGS_MODEL}:generateContent?key=${key}`;
}

// ====== Redis Keys ======

const TOPICS_KEY = (uid) => `coach:${uid}:topics`;
const MILESTONES_KEY = (uid) => `coach:${uid}:milestones`;
const SUMMARY_KEY = (uid) => `coach:${uid}:summary`;

const MAX_TOPICS = 20;
const TREND_INTERVAL = 5;

// ====== 1. 從對話中抽取心態標籤 ======

/**
 * 從心態輔導對話中抽取結構化標籤
 *
 * @param {string} userText - 用戶的訊息
 * @param {string} aiResponse - AI 的回覆
 * @returns {object|null} 對話標籤 JSON
 */
export async function extractCoachingTags(userText, aiResponse) {
  const prompt = `你是一個標籤抽取器。根據以下的心態輔導對話，抽取結構化標籤。

只輸出 JSON，不要輸出任何其他文字。

JSON 格式：
{
  "topic": "mindset" | "diet_question" | "plateau" | "binge" | "external_judgment" | "motivation" | "goal_setting" | "habit" | "emotion" | "other",
  "emotion": "frustrated" | "anxious" | "guilty" | "sad" | "confused" | "positive" | "hopeful" | "neutral",
  "intensity": "mild" | "moderate" | "strong",
  "core_issue": "一句話摘要核心問題",
  "progress_signal": "positive" | "neutral" | "struggling"
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
 * 存入一筆對話標籤
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

    return Math.min(len, MAX_TOPICS);
  } catch (err) {
    console.error('[Tags] save error:', err);
    return 0;
  }
}

/**
 * 取得最近 N 筆對話標籤
 */
export async function getRecentTopics(userId, count = 10) {
  try {
    const r = getRedis();
    const items = await r.lrange(TOPICS_KEY(userId), -count, -1);
    return items.map(item => typeof item === 'string' ? JSON.parse(item) : item);
  } catch (err) {
    return [];
  }
}

/**
 * 取得對話總數
 */
export async function getTopicCount(userId) {
  try {
    return await getRedis().llen(TOPICS_KEY(userId));
  } catch (err) {
    return 0;
  }
}

// ====== 3. 趨勢分析 & 用戶摘要 ======

/**
 * 檢查是否該觸發趨勢更新
 */
export async function shouldUpdateTrend(userId) {
  const count = await getTopicCount(userId);
  return count > 0 && count % TREND_INTERVAL === 0;
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
    const response = await fetch(getTagsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
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
 * 取得用戶心態摘要
 */
export async function getCoachingSummary(userId) {
  try {
    return await getRedis().get(SUMMARY_KEY(userId));
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
  }

  return milestones.length > 0 ? milestones[0].text : null;
}

// ====== 5. 關係階段判定 ======

export function getRelationshipStage(totalInteractions) {
  if (totalInteractions <= 3) return { stage: '初見', desc: '溫暖的陪伴者：傾聽、理解、建立信任' };
  if (totalInteractions <= 10) return { stage: '熟悉', desc: '認識你的朋友：開始引用過去對話的脈絡' };
  if (totalInteractions <= 30) return { stage: '信任', desc: '懂你的教練：針對個人弱點重點支持' };
  return { stage: '夥伴', desc: '一起走的同伴：見證成長、長期陪伴' };
}
