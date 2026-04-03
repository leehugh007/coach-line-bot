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

const USER_PREFIX = 'coach-user:';
// 自介解析：純 JSON 提取，不需要推理能力，用最便宜的穩定模型
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

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

  // 過濾群組回覆：@提及開頭的是回覆別人，不是自介
  if (/^@/.test(text.trim())) return false;

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
export async function extractProfile(introText, existingProfile = null, userId = null) {
  const existingContext = existingProfile
    ? `\n\n目前已知的資料（如果新資訊有更新就覆蓋，沒提到的保持原值）：
${JSON.stringify(existingProfile.info || {}, null, 2)}`
    : '';

  const prompt = `你是一個資料抽取器。根據以下的自我介紹文字，抽取結構化個人資料。

只輸出 JSON，不要輸出任何其他文字。如果某個欄位無法從文字中判斷，填 null。
重要：文字中 @提及的人名是「被回覆的對象」，不是發言者自己。name 欄位只填發言者自己的名字，不確定就填 null。
${existingContext}

JSON 格式：
{
  "name": "暱稱或名字（如果有，只填發言者自己的名字）",
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
    if (userId) trackApiUsage(userId, 'extract_profile', GEMINI_MODEL, data);
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
 * 取得用戶檔案（Redis 優先，miss 時從 Supabase 回補）
 */
export async function getUser(userId) {
  try {
    const cached = await getRedis().get(`${USER_PREFIX}${userId}`);
    if (cached) return cached;

    // Redis miss → 從 Supabase 回補
    const restored = await restoreUserFromSupabase(userId);
    if (restored) {
      console.log(`[User] Restored from Supabase: ${userId?.substring(0, 8)}`);
    }
    return restored;
  } catch (err) {
    console.error('[User] getUser error:', err);
    return null;
  }
}

/**
 * 從 Supabase 恢復用戶檔案到 Redis
 */
async function restoreUserFromSupabase(userId) {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;

    // 從 Supabase 取互動次數（conversations 總數）
    const { count } = await sb
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // 重建 Redis profile 格式
    const profile = {
      userId,
      createdAt: data.join_date || data.updated_at,
      updatedAt: data.updated_at,
      introText: data.intro || null,
      weekNumber: data.week_number || 0,
      info: {
        name: data.display_name || null,
        goal: data.goal || null,
      },
      stats: {
        totalInteractions: count || 0,
        lastInteractionAt: data.updated_at,
      },
    };

    // 如果有 intro，重新用 AI 抽取完整 profile（Supabase 只存了 name + goal）
    if (data.intro) {
      const extracted = await extractProfile(data.intro, null, userId);
      if (extracted) {
        for (const [key, value] of Object.entries(extracted)) {
          if (value !== null && value !== undefined) {
            profile.info[key] = value;
          }
        }
      }
    }

    // 回寫 Redis（無 TTL，永久保存）
    await getRedis().set(`${USER_PREFIX}${userId}`, profile);
    return profile;
  } catch (err) {
    console.error('[User] restoreFromSupabase error:', err);
    return null;
  }
}

/**
 * 儲存用戶檔案（Redis + Supabase 雙寫）
 */
export async function saveUser(userId, profile) {
  try {
    await getRedis().set(`${USER_PREFIX}${userId}`, profile);

    // 非阻塞寫入 Supabase
    syncUserToSupabase(userId, profile).catch(err =>
      console.error('[User] Supabase sync error:', err)
    );

    return true;
  } catch (err) {
    console.error('[User] saveUser error:', err);
    return false;
  }
}

/**
 * 同步用戶資料到 Supabase（upsert）
 */
async function syncUserToSupabase(userId, profile) {
  const sb = getSupabase();
  if (!sb) return;

  const info = profile.info || {};
  const row = {
    id: userId,
    display_name: info.name || profile.lineDisplayName || null,
    intro: profile.introText || null,
    intro_at: profile.updatedAt || null,
    goal: info.goal || null,
    week_number: profile.weekNumber || 0,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from('users').upsert(row, { onConflict: 'id' });
  if (error) console.error('[User] Supabase upsert error:', error.message);
  else console.log(`[User] Synced to Supabase: ${userId?.substring(0, 8)}`);
}

/**
 * 處理自我介紹：抽取資料並存入
 * @returns {object|null} 更新後的用戶檔案
 */
export async function processIntroduction(userId, introText) {
  const existing = await getUser(userId);

  const extractedInfo = await extractProfile(introText, existing, userId);
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

// ====== 4. 預載入自介（Excel 匯入 + 名稱比對） ======

const PRELOAD_PREFIX = 'coach-preload:'; // key = 正規化的 LINE 顯示名稱
const PRELOAD_INDEX = 'coach-preload:__index'; // SET：所有已匯入的正規化名稱
const PRELOAD_REALNAME_PREFIX = 'coach-preload-name:'; // key = 真實姓名（重名時用）
const PRELOAD_DUPES = 'coach-preload:__dupes'; // SET：有重名的正規化名稱
const PENDING_VERIFY_PREFIX = 'coach-pending-verify:'; // 等待姓名確認的 userId
const PENDING_CLASS_PREFIX = 'coach-pending-class:';  // 等待選班的 userId

/**
 * 正規化名稱：移除空格、表情符號、括號內容、轉小寫
 * 用於模糊比對 LINE 顯示名稱
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .replace(/\s+/g, '')           // 移除空格
    .replace(/[（）()【】\[\]]/g, '') // 移除括號
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '') // 移除 emoji（含 ✨🌙❤️ 等）
    .replace(/[^\p{L}\p{N}]/gu, '') // 只保留字母和數字（移除剩餘特殊符號）
    .toLowerCase()
    .trim();
}

/**
 * 批次匯入預載入自介資料
 * 從 Excel 整理好的資料匯入，以 LINE 顯示名稱為 key
 *
 * @param {Array} students - [{ lineName, studentId, intro, note }]
 * @returns {number} 成功匯入的筆數
 */
export async function batchImportIntros(students) {
  const r = getRedis();
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  let reassigned = 0;

  // 先偵測重名 + 用 realName 去重
  const nameCount = {};
  const seenRealNames = new Set();
  const deduped = [];

  for (const s of students) {
    if (!s.lineName) continue;

    // 用 realName 去重（同一個人可能 LINE 名稱不同）
    if (s.realName) {
      const normalizedReal = normalizeName(s.realName);
      if (seenRealNames.has(normalizedReal)) {
        console.log(`[User] Dedup by realName: ${s.realName} (LINE: ${s.lineName})`);
        continue; // 跳過重複的人
      }
      seenRealNames.add(normalizedReal);
    }

    deduped.push(s);
    const n = normalizeName(s.lineName);
    if (n) nameCount[n] = (nameCount[n] || 0) + 1;
  }

  // 用 deduped 取代 students
  const studentsToImport = deduped;

  for (const s of studentsToImport) {
    if (!s.lineName) { skipped++; continue; }

    const normalizedName = normalizeName(s.lineName);
    if (!normalizedName) { skipped++; continue; }

    const record = {
      lineName: s.lineName,        // 原始 LINE 名稱
      realName: s.realName || null, // 報名表真實姓名
      className: s.className || null,
      studentId: s.studentId || null,
      intro: s.intro || '',
      note: s.note || null,
      importedAt: new Date().toISOString(),
      matched: false,
      isDuplicate: nameCount[normalizedName] > 1, // 標記是否有重名
    };

    await r.set(`${PRELOAD_PREFIX}${normalizedName}`, record);
    await r.sadd(PRELOAD_INDEX, normalizedName);

    // 同時存真實姓名索引（用於重名時比對）
    if (s.realName) {
      const normalizedReal = normalizeName(s.realName);
      if (normalizedReal) {
        await r.set(`${PRELOAD_REALNAME_PREFIX}${normalizedReal}`, record);
      }
    }

    // 標記重名
    if (nameCount[normalizedName] > 1) {
      await r.sadd(PRELOAD_DUPES, normalizedName);
      duplicates++;
    }

    // === 續報自動換班：如果 Supabase 已有這個學員，直接更新 class_name ===
    if (s.className) {
      try {
        const sb = getSupabase();
        if (sb) {
          // 用 display_name 或 realName 比對已存在的學員
          const namesToMatch = [s.lineName];
          if (s.realName) namesToMatch.push(s.realName);

          for (const name of namesToMatch) {
            const { data: existing } = await sb.from('users')
              .select('id, class_name, display_name')
              .or(`display_name.eq.${name},intro.ilike.%${name}%`)
              .limit(5);

            if (existing && existing.length > 0) {
              for (const user of existing) {
                if (user.class_name !== s.className) {
                  await sb.from('users')
                    .update({ class_name: s.className })
                    .eq('id', user.id);
                  // 同步 Redis
                  const redisKey = `coach-user:${user.id}`;
                  const cached = await r.get(redisKey);
                  if (cached && typeof cached === 'object') {
                    cached.class_name = s.className;
                    await r.set(redisKey, cached);
                  }
                  reassigned++;
                  console.log(`[User] Auto reassigned ${user.display_name || user.id.substring(0, 8)} → ${s.className}`);
                }
              }
              break; // 比對到就不繼續
            }
          }
        }
      } catch (err) {
        console.error(`[User] Auto reassign error for ${s.lineName}:`, err.message);
      }
    }

    imported++;
  }

  console.log(`[User] Batch imported ${imported} intros, skipped ${skipped}, duplicates ${duplicates}, reassigned ${reassigned}`);
  return { imported, skipped, duplicates, reassigned };
}

/**
 * 用 LINE 顯示名稱查找預載入的自介
 * 嘗試精確比對和模糊比對
 *
 * @param {string} displayName - LINE API 回傳的顯示名稱
 * @returns {object|null} 預載入的自介資料
 */
export async function findPreloadedIntro(displayName, className = null) {
  const r = getRedis();
  const normalized = normalizeName(displayName);

  if (!normalized) return null;

  // 精確比對（正規化後）
  const exact = await r.get(`${PRELOAD_PREFIX}${normalized}`);
  if (exact) {
    const parsed = typeof exact === 'string' ? JSON.parse(exact) : exact;
    // 如果有指定班級，要同時符合
    if (className && parsed.className && parsed.className !== className) return null;
    return parsed;
  }

  // 模糊比對：從索引 SET 拿所有名稱，在記憶體中比對（不用 SCAN）
  try {
    const allNames = await r.smembers(PRELOAD_INDEX);
    if (!allNames || allNames.length === 0) return null;

    for (const storedName of allNames) {
      if (storedName.includes(normalized) || normalized.includes(storedName)) {
        const data = await r.get(`${PRELOAD_PREFIX}${storedName}`);
        if (data) {
          const parsed = typeof data === 'string' ? JSON.parse(data) : data;
          if (className && parsed.className && parsed.className !== className) continue;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error('[User] Fuzzy match error:', err);
  }

  return null;
}

/**
 * 用真實姓名查找預載入資料（重名 LINE 名稱時的備援比對）
 */
export async function findPreloadedByRealName(realName, className = null) {
  const r = getRedis();
  const normalized = normalizeName(realName);
  if (!normalized) return null;

  const data = await r.get(`${PRELOAD_REALNAME_PREFIX}${normalized}`);
  if (data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed.matched) {
      if (className && parsed.className && parsed.className !== className) return null;
      return parsed;
    }
  }
  return null;
}

/**
 * 檢查 LINE 名稱是否有重名
 */
export async function isLinNameDuplicate(displayName) {
  const r = getRedis();
  const normalized = normalizeName(displayName);
  if (!normalized) return false;
  return await r.sismember(PRELOAD_DUPES, normalized);
}

/**
 * 設定等待姓名確認狀態（加好友但還沒比對到的）
 */
export async function setPendingVerify(userId, displayName) {
  const r = getRedis();
  await r.set(`${PENDING_VERIFY_PREFIX}${userId}`, displayName, { ex: 86400 * 7 }); // 7天過期
}

/**
 * 取得等待確認狀態
 */
export async function getPendingVerify(userId) {
  const r = getRedis();
  return await r.get(`${PENDING_VERIFY_PREFIX}${userId}`);
}

/**
 * 清除等待確認狀態
 */
export async function clearPendingVerify(userId) {
  const r = getRedis();
  await r.del(`${PENDING_VERIFY_PREFIX}${userId}`);
}

// ====== 班別選擇等待狀態 ======

/**
 * 設定等待選班狀態
 */
export async function setPendingClassSelect(userId, displayName) {
  const r = getRedis();
  await r.set(`${PENDING_CLASS_PREFIX}${userId}`, JSON.stringify({ displayName }), { ex: 86400 * 7 });
}

/**
 * 取得等待選班狀態
 */
export async function getPendingClassSelect(userId) {
  const r = getRedis();
  const data = await r.get(`${PENDING_CLASS_PREFIX}${userId}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

/**
 * 清除等待選班狀態
 */
export async function clearPendingClassSelect(userId) {
  const r = getRedis();
  await r.del(`${PENDING_CLASS_PREFIX}${userId}`);
}

/**
 * 取得目前進行中的班級名稱列表
 */
export async function getActiveClassNames() {
  const r = getRedis();
  const CLASS_KEY_PREFIX = 'coach-class:';
  const allNames = await r.smembers('coach-classes-index');
  if (!allNames || allNames.length === 0) return [];

  const now = new Date();
  const active = [];
  for (const cn of allNames) {
    const cd = await r.get(`${CLASS_KEY_PREFIX}${cn}`);
    if (cd) {
      const parsed = typeof cd === 'string' ? JSON.parse(cd) : cd;
      const start = new Date(parsed.startDate);
      const end = parsed.endDate ? new Date(parsed.endDate) : null;
      if (now >= start && (!end || now <= end)) active.push(cn);
    }
  }
  return active;
}

/**
 * 用真實姓名完成比對（重名時用）
 */
export async function tryMatchByRealName(userId, realName, className = null) {
  const preloaded = await findPreloadedByRealName(realName, className);
  if (!preloaded || preloaded.matched) return false;

  console.log(`[User] RealName match! ${realName} → ${preloaded.lineName}`);

  if (preloaded.intro) {
    await processIntroduction(userId, preloaded.intro);
  }

  // 存入班級
  if (preloaded.className) {
    const user = await getUser(userId);
    if (user) {
      user.className = preloaded.className;
      await saveUser(userId, user);
      try {
        const { getSupabase } = await import('@/lib/supabase');
        const sb = getSupabase();
        if (sb) {
          await sb.from('users').update({ class_name: preloaded.className }).eq('id', userId);
        }
      } catch (e) { console.error('[User] className sync error:', e); }
    }
  }

  // 標記為已配對
  const r = getRedis();
  const normalizedLine = normalizeName(preloaded.lineName);
  preloaded.matched = true;
  preloaded.matchedUserId = userId;
  preloaded.matchedAt = new Date().toISOString();
  await r.set(`${PRELOAD_PREFIX}${normalizedLine}`, preloaded);

  const normalizedReal = normalizeName(realName);
  if (normalizedReal) {
    await r.set(`${PRELOAD_REALNAME_PREFIX}${normalizedReal}`, preloaded);
  }

  return true;
}

/**
 * 嘗試用 LINE 顯示名稱配對預載入資料，並自動匯入到用戶檔案
 *
 * @param {string} userId - LINE userId
 * @param {string} displayName - LINE 顯示名稱
 * @returns {boolean} 是否成功配對
 */
export async function tryMatchPreloaded(userId, displayName, className = null) {
  const preloaded = await findPreloadedIntro(displayName, className);
  if (!preloaded || preloaded.matched) return false;

  console.log(`[User] Match found! ${displayName} → preloaded intro from ${preloaded.lineName}`);

  // 處理這份自介，存入 userId 的檔案
  await processIntroduction(userId, preloaded.intro);

  // 存入班級（如果匯入時有帶 className）
  if (preloaded.className) {
    const user = await getUser(userId);
    if (user) {
      user.className = preloaded.className;
      await saveUser(userId, user);
      // 同步到 Supabase
      try {
        const { getSupabase } = await import('@/lib/supabase');
        const sb = getSupabase();
        if (sb) {
          await sb.from('users').update({ class_name: preloaded.className }).eq('id', userId);
        }
      } catch (e) { console.error('[User] className sync error:', e); }
      console.log(`[User] className set: ${preloaded.className} for ${userId?.substring(0, 8)}`);
    }
  }

  // 標記為已配對
  const r = getRedis();
  const normalized = normalizeName(preloaded.lineName);
  preloaded.matched = true;
  preloaded.matchedUserId = userId;
  preloaded.matchedAt = new Date().toISOString();
  await r.set(`${PRELOAD_PREFIX}${normalized}`, preloaded);

  return true;
}

/**
 * 取得所有預載入資料的狀態
 * @returns {Array} 預載入資料清單
 */
export async function getPreloadedStatus() {
  const r = getRedis();
  const results = [];

  try {
    // 從索引 SET 取得所有名稱（不用 SCAN，秒回）
    const allNames = await r.smembers(PRELOAD_INDEX);
    if (!allNames || allNames.length === 0) return results;

    // 批次取得所有資料
    const keys = allNames.map(name => `${PRELOAD_PREFIX}${name}`);
    const values = await r.mget(...keys);

    for (let i = 0; i < allNames.length; i++) {
      const data = values[i];
      if (!data) continue;
      const record = typeof data === 'string' ? JSON.parse(data) : data;
      results.push({
        lineName: record.lineName || allNames[i],
        className: record.className || null,
        studentId: record.studentId || null,
        matched: !!record.matched,
        matchedUserId: record.matchedUserId || null,
      });
    }
  } catch (err) {
    console.error('[User] getPreloadedStatus error:', err);
  }

  return results;
}

// ====== 5. 產生 userContext ======

/**
 * 根據用戶檔案和心態摘要，產生注入 System Prompt 的上下文
 * 支援用戶切片動態注入：AI 意圖分類決定該注入哪些切片
 *
 * 切片設計：
 * - identity：名字、性別、年齡、互動次數、關係階段（永遠注入）
 * - lifestyle：職業、工作型態、家庭、生活挑戰
 * - body_goal：身高體重、目標、性格特點
 * - coaching_trend：心態趨勢摘要
 * - journey：旅程摘要
 *
 * @param {object|null} user - 用戶檔案
 * @param {string|null} coachingSummary - 心態趨勢摘要（近況）
 * @param {string|null} journeySummary - 旅程摘要（長期累積）
 * @param {string[]|null} slices - AI 選取的用戶切片（null = 全部注入，向下相容）
 * @returns {string} 要注入的上下文文字
 */
export function buildUserContext(user, recentTags = null, slices = null, activeGoal = null) {
  if (!user && !recentTags) return '';

  // slices 為 null 時全部注入（向下相容：群組草稿、舊流程）
  const injectAll = !slices;
  const sliceSet = slices ? new Set(slices) : null;
  const shouldInject = (name) => injectAll || sliceSet?.has(name);

  let context = '\n\n【這位學員的資訊 — 用來個人化你的回覆】';

  const info = user?.info;
  const interactions = user?.stats?.totalInteractions || 0;

  // === identity 切片（永遠注入）===
  if (info?.name) context += `\n名字：${info.name}`;
  if (info?.gender) context += `，${info.gender === 'male' ? '男' : '女'}性`;
  if (info?.age) context += `，${info.age} 歲`;

  context += `\n互動次數：第 ${interactions} 次`;

  let stage = '初見';
  if (interactions > 30) stage = '夥伴';
  else if (interactions > 10) stage = '信任';
  else if (interactions > 3) stage = '熟悉';
  context += `（${stage}階段）`;

  // === lifestyle 切片 ===
  if (shouldInject('lifestyle') && info) {
    if (info.job) {
      context += `\n職業：${info.job}`;
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
    }
    if (info.family) context += `\n家庭：${info.family}`;
    if (info.life_challenge) {
      context += `\n生活挑戰：${info.life_challenge}`;
      context += `\n→ 建議要考慮這個現實，不要給不切實際的建議。`;
    }
    if (info.work_schedule === 'shift' || info.work_schedule === 'night_shift' || info.work_schedule === 'irregular') {
      context += `\n→ 作息不固定，飲食建議要考慮無法定時吃三餐的現實。`;
    }
  }

  // === body_goal 切片 ===
  if (shouldInject('body_goal') && info) {
    if (info.height_cm || info.weight_kg) {
      context += '\n身體資料：';
      if (info.height_cm) context += `${info.height_cm}cm`;
      if (info.height_cm && info.weight_kg) context += ' / ';
      if (info.weight_kg) context += `${info.weight_kg}kg`;
    }
    if (info.goal) context += `\n目標：${info.goal}`;
    if (info.personality_notes) context += `\n性格特點：${info.personality_notes}`;
  }

  // === 最近對話標籤（取代 journey/summary，永遠是最新狀態）===
  if (shouldInject('coaching_trend') && recentTags && recentTags.length > 0) {
    const tagLines = recentTags.slice(-15).map(t => {
      const parts = [];
      if (t.topic) parts.push(t.topic);
      if (t.emotion && t.emotion !== 'neutral') parts.push(t.emotion);
      if (t.progress_signal && t.progress_signal !== 'neutral') parts.push(t.progress_signal);
      const issue = t.core_issue ? `：${t.core_issue}` : '';
      return `- ${parts.join('/')}${issue}`;
    }).join('\n');

    context += `\n\n【學員最近的對話紀錄 — 這是即時資料，以此為準】
${tagLines}

注意：以上是最近 ${recentTags.length} 次對話的標籤，反映學員「現在」的狀態。
- 如果最近的標籤顯示正向進展，要看到並肯定
- 如果情緒偏低，先回應情緒再給建議
- 不要引用這裡沒有的舊資訊`;
  }

  // === 當前目標（有就注入）===
  if (activeGoal) {
    const setDate = new Date(activeGoal.created_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
    context += `\n\n【學員的當前目標（${setDate} 設定）】
${activeGoal.goal_text}
→ 不要每次都問，但第 2-3 次對話時自然帶入：「上次說要試試看...做得怎樣？」
→ 做到了就肯定，沒做到就調整，不責備`;
  }

  // log 切片使用情況
  if (slices) {
    console.log(`[UserContext] Slices: identity(always) + ${slices.join(', ') || 'none'}${activeGoal ? ' + goal' : ''} → ${context.length} chars`);
  }

  return context;
}

// ====== 目標系統 ======

const GOAL_KEY = (uid) => `coach-goal:${uid}`;

/**
 * 取得學員當前目標
 * Redis 快取 → Supabase fallback
 */
export async function getActiveGoal(userId) {
  try {
    const r = getRedis();
    const cached = await r.get(GOAL_KEY(userId));
    if (cached) return cached;

    // Redis miss → Supabase
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb.from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (data?.[0]) {
      const goal = data[0];
      await r.set(GOAL_KEY(userId), goal);
      return goal;
    }
    return null;
  } catch (err) {
    console.error('[Goal] getActiveGoal error:', err.message);
    return null;
  }
}

/**
 * 設定新目標（舊目標自動標為 replaced）
 */
export async function setGoal(userId, goalText, context = null) {
  try {
    const sb = getSupabase();
    const r = getRedis();

    // 舊目標標為 replaced
    if (sb) {
      await sb.from('goals')
        .update({ status: 'replaced', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'active');
    }

    const goal = {
      user_id: userId,
      goal_text: goalText,
      context: context,
      status: 'active',
      created_at: new Date().toISOString(),
    };

    // 寫 Supabase
    if (sb) {
      const { error } = await sb.from('goals').insert(goal);
      if (error) console.error('[Goal] insert error:', error.message);
    }

    // 寫 Redis 快取
    await r.set(GOAL_KEY(userId), goal);

    console.log(`[Goal] Set for ${userId}: ${goalText}`);
    return goal;
  } catch (err) {
    console.error('[Goal] setGoal error:', err.message);
    return null;
  }
}

/**
 * 完成目標
 */
export async function completeGoal(userId) {
  try {
    const sb = getSupabase();
    const r = getRedis();

    if (sb) {
      await sb.from('goals')
        .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'active');
    }

    await r.del(GOAL_KEY(userId));
    console.log(`[Goal] Completed for ${userId}`);
  } catch (err) {
    console.error('[Goal] completeGoal error:', err.message);
  }
}

/**
 * 取得目標歷史（給「我的進步」顯示用）
 */
export async function getGoalHistory(userId, limit = 5) {
  try {
    const sb = getSupabase();
    if (!sb) return [];
    const { data } = await sb.from('goals')
      .select('goal_text, status, created_at, completed_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  } catch (err) {
    console.error('[Goal] getGoalHistory error:', err.message);
    return [];
  }
}

// ====== 健康存摺：Streak 追蹤 ======

const STREAK_KEY = (uid) => `coach-streak:${uid}`;

/**
 * 記錄今日互動 + 更新 streak
 * 回傳 { streak, totalDays, firstDay }
 */
export async function recordStreak(userId) {
  try {
    const r = getRedis();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }); // YYYY-MM-DD

    const data = await r.get(STREAK_KEY(userId));
    const current = data || { streak: 0, lastDate: null, totalDays: 0, firstDay: today };

    if (current.lastDate === today) {
      // 今天已經記錄過，不重複計算
      return current;
    }

    // 計算是否連續
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

    const isConsecutive = current.lastDate === yesterdayStr;

    const updated = {
      streak: isConsecutive ? current.streak + 1 : 1,
      lastDate: today,
      totalDays: (current.totalDays || 0) + 1,
      firstDay: current.firstDay || today,
    };

    await r.set(STREAK_KEY(userId), updated);
    return updated;
  } catch (err) {
    console.error('[Streak] Error:', err.message);
    return { streak: 0, totalDays: 0, firstDay: null };
  }
}

/**
 * 取得 streak 資料（不更新）
 */
export async function getStreak(userId) {
  try {
    const r = getRedis();
    const data = await r.get(STREAK_KEY(userId));
    if (!data) return { streak: 0, totalDays: 0, firstDay: null };

    // 檢查 streak 是否已斷（今天或昨天都沒互動）
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

    if (data.lastDate !== today && data.lastDate !== yesterdayStr) {
      // streak 已斷，但 totalDays 保留
      return { ...data, streak: 0 };
    }
    return data;
  } catch (err) {
    console.error('[Streak] getStreak error:', err.message);
    return { streak: 0, totalDays: 0, firstDay: null };
  }
}
