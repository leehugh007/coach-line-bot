/**
 * 學員個人檔案模組
 *
 * 功能：
 * 1. 偵測自我介紹文字，用 AI 抽取結構化個人資料
 * 2. 將個人資料存入 Redis，長期保存
 * 3. 產生 userContext 注入 System Prompt，讓回覆更針對性
 *
 * Redis key: coach-user:{userId}
 * 無 TTL（永久保存，學員資料不會過期）
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

const USER_PREFIX = 'coach-user:';
const GEMINI_MODEL = 'gemini-2.5-flash';

function getApiUrl() {
  const key = process.env.GEMINI_API_KEY;
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
}

// ====== 1. 自我介紹偵測 ======

/**
 * 判斷用戶的訊息是否像自我介紹
 * 用簡單的關鍵字檢測，避免每則訊息都呼叫 AI
 */
export function looksLikeIntroduction(text) {
  if (!text || text.length < 15) return false;
  if (text.length > 1000) return false; // 太長的不太像自介

  const introKeywords = [
    '自我介紹', '我叫', '我是', '我今年', '歲',
    '職業', '工作是', '做的是', '住在', '家裡有',
    '小孩', '孩子', '先生', '老公', '太太', '老婆',
    '爸爸', '媽媽', '父親', '母親',
    '護士', '護理師', '老師', '上班族', '家庭主婦',
    '三班倒', '輪班', '大夜班',
    '身高', '體重', '公斤', 'kg', 'cm',
    '目標', '減肥', '瘦身',
  ];

  const text_lower = text.toLowerCase();
  let matchCount = 0;

  for (const kw of introKeywords) {
    if (text_lower.includes(kw)) {
      matchCount++;
    }
  }

  // 至少匹配 2 個關鍵字，而且訊息夠長（大於 30 字），才算自介
  return matchCount >= 2 && text.length >= 30;
}

// ====== 2. AI 抽取個人資料 ======

/**
 * 用 Gemini 從自我介紹文字中抽取結構化個人資料
 *
 * @param {string} introText - 自我介紹文字
 * @param {object|null} existingProfile - 現有的個人資料（用於合併）
 * @returns {object|null} 結構化個人資料
 */
export async function extractProfile(introText, existingProfile = null) {
  const existingContext = existingProfile
    ? `\n\n目前已知的資料（如果新資訊有更新就覆蓋，沒提到的保持原值）：
${JSON.stringify(existingProfile.info || {}, null, 2)}`
    : '';

  const prompt = `你是一個資料抽取器。根據以下的自我介紹文字，抽取結構化個人資料。

只輸出 JSON，不要輸出任何其他文字。如果某個欄位無法從文字中判斷，填 null。
${existingContext}

JSON 格式：
{
  "name": "暱稱或名字（如果有）",
  "gender": "male" | "female" | null,
  "age": 數字或null,
  "job": "職業描述",
  "work_schedule": "normal" | "shift" | "night_shift" | "irregular" | "freelance" | "homemaker" | null,
  "family": "家庭狀況簡述（例如：已婚育有兩子、需要照顧年邁父親）",
  "life_challenge": "影響飲食或作息的生活挑戰（例如：三班倒吃飯不固定、照顧家人很忙沒時間煮）",
  "height_cm": 數字或null,
  "weight_kg": 數字或null,
  "goal": "減肥目標描述",
  "personality_notes": "從文字推測的性格特點（例如：容易自責、很有行動力、比較焦慮）",
  "key_quote": "自介中最值得記住的一句話原文"
}

自我介紹文字：
「${introText}」`;

  try {
    const response = await fetch(getApiUrl(), {
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

    if (!response.ok) {
      console.error('[User] Extract API error:', response.status);
      return null;
    }

    const data = await response.json();
    const textPart = data?.candidates?.[0]?.content?.parts?.find(p => p.text);
    if (!textPart) return null;

    const profile = JSON.parse(textPart.text);
    console.log('[User] Extracted:', profile.name, profile.job, profile.life_challenge);
    return profile;

  } catch (err) {
    console.error('[User] Extract error:', err);
    return null;
  }
}

// ====== 3. Redis 存取 ======

/**
 * 取得用戶檔案
 */
export async function getUser(userId) {
  try {
    return await getRedis().get(`${USER_PREFIX}${userId}`) || null;
  } catch (err) {
    console.error('[User] getUser error:', err);
    return null;
  }
}

/**
 * 儲存用戶檔案
 */
export async function saveUser(userId, profile) {
  try {
    await getRedis().set(`${USER_PREFIX}${userId}`, profile);
    return true;
  } catch (err) {
    console.error('[User] saveUser error:', err);
    return false;
  }
}

/**
 * 處理自我介紹：抽取資料並存入
 * @returns {object|null} 更新後的用戶檔案
 */
export async function processIntroduction(userId, introText) {
  const existing = await getUser(userId);

  const extractedInfo = await extractProfile(introText, existing);
  if (!extractedInfo) return null;

  const now = new Date().toISOString();

  const profile = existing || {
    userId,
    createdAt: now,
    info: {},
    stats: { totalInteractions: 0 },
  };

  // 合併：新資料覆蓋舊資料，null 的保持原值
  const merged = { ...(profile.info || {}) };
  for (const [key, value] of Object.entries(extractedInfo)) {
    if (value !== null && value !== undefined) {
      merged[key] = value;
    }
  }

  profile.info = merged;
  profile.updatedAt = now;
  profile.introText = introText; // 保存原文以便參考

  await saveUser(userId, profile);
  console.log(`[User] Profile saved for ${userId?.substring(0, 8)}: ${merged.name || 'unnamed'}`);

  return profile;
}

/**
 * 記錄互動次數
 */
export async function recordInteraction(userId) {
  const existing = await getUser(userId);

  if (!existing) {
    // 還沒有自介，建立一個最小檔案
    const profile = {
      userId,
      createdAt: new Date().toISOString(),
      info: {},
      stats: { totalInteractions: 1, lastInteractionAt: new Date().toISOString() },
    };
    await saveUser(userId, profile);
    return profile;
  }

  if (!existing.stats) existing.stats = { totalInteractions: 0 };
  existing.stats.totalInteractions = (existing.stats.totalInteractions || 0) + 1;
  existing.stats.lastInteractionAt = new Date().toISOString();

  await saveUser(userId, existing);
  return existing;
}

// ====== 4. 產生 userContext ======

/**
 * 根據用戶檔案和心態摘要，產生注入 System Prompt 的上下文
 *
 * @param {object|null} user - 用戶檔案
 * @param {string|null} coachingSummary - 心態趨勢摘要
 * @returns {string} 要注入的上下文文字
 */
export function buildUserContext(user, coachingSummary = null) {
  if (!user && !coachingSummary) return '';

  let context = '\n\n【這位學員的資訊 — 用來個人化你的回覆】';

  const info = user?.info;
  const interactions = user?.stats?.totalInteractions || 0;

  if (info && Object.keys(info).some(k => info[k] !== null)) {
    if (info.name) context += `\n名字：${info.name}`;
    if (info.gender) context += `，${info.gender === 'male' ? '男' : '女'}性`;
    if (info.age) context += `，${info.age} 歲`;
    if (info.job) context += `\n職業：${info.job}`;
    if (info.work_schedule) {
      const scheduleMap = {
        normal: '正常上班時間',
        shift: '輪班制',
        night_shift: '大夜班',
        irregular: '時間不固定',
        freelance: '自由工作者',
        homemaker: '家庭主婦/主夫',
      };
      context += `（${scheduleMap[info.work_schedule] || info.work_schedule}）`;
    }
    if (info.family) context += `\n家庭：${info.family}`;
    if (info.life_challenge) context += `\n生活挑戰：${info.life_challenge}`;
    if (info.height_cm || info.weight_kg) {
      context += '\n身體資料：';
      if (info.height_cm) context += `${info.height_cm}cm`;
      if (info.height_cm && info.weight_kg) context += ' / ';
      if (info.weight_kg) context += `${info.weight_kg}kg`;
    }
    if (info.goal) context += `\n目標：${info.goal}`;
    if (info.personality_notes) context += `\n性格特點：${info.personality_notes}`;
  }

  context += `\n互動次數：第 ${interactions} 次`;

  // 關係階段
  let stage = '初見';
  if (interactions > 30) stage = '夥伴';
  else if (interactions > 10) stage = '信任';
  else if (interactions > 3) stage = '熟悉';
  context += `（${stage}階段）`;

  // 注入心態摘要
  if (coachingSummary) {
    context += `\n\n【學員心態趨勢 — 根據過去對話累積的觀察】
${coachingSummary}

根據上面的摘要：
- 如果學員持續在某個問題上卡關，用不同的角度或比喻來回應
- 如果學員有正向進展的跡象，要看到並肯定
- 如果學員的情緒狀態偏低，先回應情緒，再給建議
- 根據學員的生活狀況（工作、家庭），給出符合實際的建議`;
  }

  // 生活挑戰的特別提醒
  if (info?.life_challenge) {
    context += `\n\n特別注意：這位學員的生活挑戰是「${info.life_challenge}」，你的建議要考慮到這個現實，不要給不切實際的建議。`;
  }

  if (info?.work_schedule === 'shift' || info?.work_schedule === 'night_shift' || info?.work_schedule === 'irregular') {
    context += `\n這位學員作息不固定，給飲食建議時要考慮到他無法像一般人那樣定時吃三餐的現實。`;
  }

  return context;
}
