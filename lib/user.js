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

// ====== 0. Normalize Helpers（契約 §4.2 邊界規則）======

/**
 * Supabase users row → Redis profile shape（snake_case → camelCase）
 *
 * 純資料映射，不含 AI extractProfile（caller 自己做）
 * stats.totalInteractions 預設 0，caller 透過 opts.interactionCount 傳入
 *
 * @param {object|null} row - Supabase users 表單筆
 * @param {object} [opts]
 * @param {number} [opts.interactionCount] - conversations 總數（caller 已 query）
 * @returns {object|null}
 */
export function normalizeUserToRedis(row, opts = {}) {
  if (!row) return null;
  return {
    userId: row.id,
    createdAt: row.join_date || row.updated_at,
    updatedAt: row.updated_at,
    introText: row.intro || null,
    weekNumber: row.week_number || 0,
    className: row.class_name ?? null,
    info: {
      name: row.display_name || null,
      goal: row.goal || null,
    },
    stats: {
      totalInteractions: opts.interactionCount ?? 0,
      lastInteractionAt: row.updated_at,
    },
    renewalIntent: row.renewal_intent ?? null,
    renewalIntentAt: row.renewal_intent_at ?? null,
    renewalIntentSource: row.renewal_intent_source ?? null,
    renewalConfirmedAt: row.renewal_confirmed_at ?? null,
  };
}

/**
 * Redis profile → Supabase users upsert payload（camelCase → snake_case）
 *
 * 採 spread 防覆蓋語意：profile 中 undefined 的欄位不寫入（保留 DB 既有值）
 * 契約 §10 Phase 1.5.A — 防整包 upsert 把未設定的 renewal 欄位蓋成 null
 *
 * @param {object|null} profile - Redis profile（必須含 userId）
 * @returns {object|null}
 */
export function normalizeUserToSupabase(profile) {
  if (!profile || !profile.userId) return null;
  const info = profile.info || {};
  return {
    id: profile.userId,
    display_name: info.name || profile.lineDisplayName || null,
    intro: profile.introText || null,
    intro_at: profile.updatedAt || null,
    goal: info.goal || null,
    week_number: profile.weekNumber || 0,
    updated_at: new Date().toISOString(),
    // 4 個 renewal 欄位 spread 防覆蓋（undefined 才不寫，null 是有意清空要寫）
    ...(profile.renewalIntent !== undefined && { renewal_intent: profile.renewalIntent }),
    ...(profile.renewalIntentAt !== undefined && { renewal_intent_at: profile.renewalIntentAt }),
    ...(profile.renewalIntentSource !== undefined && { renewal_intent_source: profile.renewalIntentSource }),
    ...(profile.renewalConfirmedAt !== undefined && { renewal_confirmed_at: profile.renewalConfirmedAt }),
  };
}

/**
 * 讀 className（過渡期 fallback：camelCase 優先，snake_case 後備）
 * 契約 §4.2 — 跑 backfill-class-sync 確認 0 髒後可拔 fallback
 */
export function readClassName(profile) {
  if (!profile) return null;
  return profile.className ?? profile.class_name ?? null;
}

/**
 * 讀 renewalIntent（同 readClassName 模式）
 */
export function readRenewalIntent(profile) {
  if (!profile) return null;
  return profile.renewalIntent ?? profile.renewal_intent ?? null;
}

// ====== 1. 自我介紹偵測 ======

/**
 * 判斷用戶的訊息是否像自我介紹
 * 用簡單的關鍵字檢測，避免每則訊息都呼叫 AI
 */
export function looksLikeIntroduction(text) {
  if (!text || text.length < 15) return false;
  if (text.length > 4000) return false; // 超長訊息才排除（詳細自介可能很長）

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
 * snake → camel 轉換走 normalizeUserToRedis helper（契約 §4.2）
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

    // 用 normalize helper 轉 Supabase row → Redis profile shape
    const profile = normalizeUserToRedis(data, { interactionCount: count });
    if (!profile) return null;

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
 * camel → snake 轉換走 normalizeUserToSupabase helper（契約 §4.2）
 * spread 防覆蓋語意保留在 helper 內（契約 §10 Phase 1.5.A）
 */
async function syncUserToSupabase(userId, profile) {
  const sb = getSupabase();
  if (!sb) return;

  // 確保 userId 在 profile 內（normalize helper 需要）
  const row = normalizeUserToSupabase({ ...profile, userId });
  if (!row) return;

  const { error } = await sb.from('users').upsert(row, { onConflict: 'id' });
  if (error) console.error('[User] Supabase upsert error:', error.message);
  else console.log(`[User] Synced to Supabase: ${userId?.substring(0, 8)}`);
}

/**
 * 更新 renewal_intent 欄位（原子化 Supabase UPDATE + Redis profile 同步）
 *
 * 抄 tryMatchPreloaded L452-462 pattern — 直接 Supabase update + Redis 單欄位同步
 * 不走 saveUser → syncUserToSupabase（避免整包 upsert 寫二次）
 *
 * 契約：coach-line-bot/契約_續報記錄.md §9
 *
 * @param {string} userId
 * @param {{ intent: string, at: Date, source: string }} params
 * @returns {Promise<boolean>}
 */
export async function updateRenewalIntent(userId, { intent, at, source }) {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const atIso = at.toISOString();

    // 1. Supabase 直寫（不走 saveUser/syncUserToSupabase）
    const { error } = await sb.from('users').update({
      renewal_intent: intent,
      renewal_intent_at: atIso,
      renewal_intent_source: source,
      updated_at: atIso,
    }).eq('id', userId);

    if (error) {
      console.error('[Renewal] Supabase update error:', error.message);
      return false;
    }

    // 2. Redis profile 單欄位同步（只動 4 個 camelCase 欄位，不整包 saveUser）
    const r = getRedis();
    const profile = await r.get(`${USER_PREFIX}${userId}`);
    if (profile) {
      profile.renewalIntent = intent;
      profile.renewalIntentAt = atIso;
      profile.renewalIntentSource = source;
      await r.set(`${USER_PREFIX}${userId}`, profile);
    }
    // Redis miss 時 silent skip — 下次 getUser read-through 會從 Supabase 重建 profile
    // 帶入 4 個新 camelCase 欄位（restoreUserFromSupabase 已擴）

    console.log(`[Renewal] Updated ${userId?.substring(0, 8)}: ${intent} (${source})`);
    return true;
  } catch (err) {
    console.error('[Renewal] updateRenewalIntent error:', err);
    return false;
  }
}

/**
 * 換班 state transition 統一入口（契約 §4 + 雷池洞 36 根治解）
 *
 * 封裝多 storage 同步：
 *   1. Supabase users.class_name + 4 個 renewal 欄位（plain UPDATE，非整包 upsert）
 *   2. Redis profile.className（camelCase）+ delete profile.class_name（清舊殘留）+ 4 個 renewal 欄位
 *   3. Cache invalidation：Portrait + Portrait-ver + renewal-notify-cd + renewal-push w10/w11/w12
 *
 * 寫入順序：Supabase 先 → Redis profile → cache deletes
 *   - Supabase 先成功是「永久層穩」，Redis/cache 失敗有 backfill-class-sync 修
 *   - 反序則 Redis 比 Supabase 新，下次 saveUser upsert 把舊 Supabase 寫回 = 更糟
 *
 * 失敗中段恢復路徑：app/api/admin/backfill-class-sync 已是現成腳本
 *
 * 觸發源（3 個現役）：
 *   - lib/user.js batchImportIntros() auto-reassign（教練上傳名單時學員已存在）
 *   - app/api/admin/students POST（教練手動換班）
 *   - lib/user.js tryMatchPreloaded / tryMatchByRealName（首次配對寫入 className）
 *
 * @param {string} userId
 * @param {string|null} newClassName - 新班別（null 代表清空）
 * @param {object} [opts]
 * @param {boolean} [opts.skipRenewalReset=false] - true = 只動 className 不清 renewal（首次配對場景）
 * @param {boolean} [opts.skipCacheInvalidation=false] - true = 不清 portrait/cooldown/push log（首次配對場景）
 * @param {string} [opts.source='admin'] - log 用：admin|auto|preload-match
 * @returns {Promise<{ changed: boolean, oldClass: string|null, newClass: string|null, error?: string }>}
 */
export async function performClassChange(userId, newClassName, opts = {}) {
  const sb = getSupabase();
  if (!sb || !userId) return { changed: false, oldClass: null, newClass: null, error: 'no_sb_or_userId' };

  const r = getRedis();
  const source = opts.source || 'admin';
  const skipRenewalReset = !!opts.skipRenewalReset;
  const skipCacheInvalidation = !!opts.skipCacheInvalidation;
  const target = newClassName || null;

  try {
    // 1. SELECT 舊值（idempotent guard：oldClass === newClass 直接 noop）
    const { data: old, error: selErr } = await sb
      .from('users')
      .select('class_name')
      .eq('id', userId)
      .single();

    if (selErr && selErr.code !== 'PGRST116') {
      console.error(`[ClassChange] SELECT error ${userId?.substring(0, 8)}:`, selErr.message);
      return { changed: false, oldClass: null, newClass: target, error: selErr.message };
    }

    const oldClass = old?.class_name || null;

    // Idempotent guard：oldClass === target → 順手檢查 Redis 髒（19 筆髒資料同型態防護）
    // 不能直接 noop，否則 Supabase 對 + Redis 髒的修復路徑被跳過（雷池 Pattern 1 預警）
    if (oldClass === target) {
      try {
        const cached = await r.get(`${USER_PREFIX}${userId}`);
        if (cached && typeof cached === 'object') {
          const hasStaleSnake = cached.class_name !== undefined;
          const camelMismatch = cached.className !== target;
          if (hasStaleSnake || camelMismatch) {
            cached.className = target;
            delete cached.class_name;
            await r.set(`${USER_PREFIX}${userId}`, cached);
            console.log(`[ClassChange] ${userId?.substring(0, 8)} idempotent Redis cleanup (stale=${hasStaleSnake} mismatch=${camelMismatch})`);
            return { changed: true, oldClass, newClass: target, cleanup: 'redis-only' };
          }
        }
      } catch (err) {
        console.error(`[ClassChange] idempotent cleanup error ${userId?.substring(0, 8)}:`, err.message);
      }
      return { changed: false, oldClass, newClass: target };
    }

    // 2. Supabase plain UPDATE（5 欄位 max）
    const updates = {
      class_name: target,
      updated_at: new Date().toISOString(),
    };
    if (!skipRenewalReset) {
      updates.renewal_intent = null;
      updates.renewal_intent_at = null;
      updates.renewal_intent_source = null;
      updates.renewal_confirmed_at = null;
    }

    // 用 .select() 拿回更新後的 row，0 列 = row 不存在（首次配對 race，syncUserToSupabase fire-and-forget 還沒跑完）
    const { data: updatedRows, error: updErr } = await sb
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id');

    if (updErr) {
      console.error(`[ClassChange] Supabase UPDATE error ${userId?.substring(0, 8)}:`, updErr.message);
      return { changed: false, oldClass, newClass: target, error: updErr.message };
    }

    // Row 不存在 → fallback upsert（避免靜默失敗）
    if (!updatedRows || updatedRows.length === 0) {
      console.warn(`[ClassChange] ${userId?.substring(0, 8)} no row updated, fallback to upsert (likely first-match race)`);
      const upsertRow = { id: userId, ...updates };
      const { error: upErr } = await sb.from('users').upsert(upsertRow, { onConflict: 'id' });
      if (upErr) {
        console.error(`[ClassChange] upsert fallback error ${userId?.substring(0, 8)}:`, upErr.message);
        return { changed: false, oldClass, newClass: target, error: upErr.message };
      }
    }

    // 3. Redis profile 同步（camelCase + delete snake 殘留）
    try {
      const cached = await r.get(`${USER_PREFIX}${userId}`);
      if (cached && typeof cached === 'object') {
        cached.className = target;
        delete cached.class_name; // 清舊 snake_case 殘留（過渡期 fallback 拔除前的清理）
        if (!skipRenewalReset) {
          cached.renewalIntent = null;
          cached.renewalIntentAt = null;
          cached.renewalIntentSource = null;
          cached.renewalConfirmedAt = null;
        }
        await r.set(`${USER_PREFIX}${userId}`, cached);
      }
      // Redis miss 時 silent skip — 下次 getUser read-through 會從 Supabase 重建
    } catch (err) {
      console.error(`[ClassChange] Redis profile sync error ${userId?.substring(0, 8)}:`, err.message);
      // 不阻斷：Supabase 已成功，可由 backfill-class-sync 修
    }

    // 4. Cache invalidation（新班期重新開始；首次配對場景可 skip）
    // 用 Promise.allSettled 而非 Promise.all：單一 key 失敗不擋其他 5 個
    if (!skipCacheInvalidation) {
      const cacheKeys = [
        `coach-portrait:${userId}`,
        `coach-portrait-ver:${userId}`,
        `coach-renewal-notify-cd:${userId}`,
        `coach-renewal-push:${userId}:w10`,
        `coach-renewal-push:${userId}:w11`,
        `coach-renewal-push:${userId}:w12`,
      ];
      const results = await Promise.allSettled(cacheKeys.map(k => r.del(k)));
      const failed = results
        .map((res, i) => res.status === 'rejected' ? cacheKeys[i] : null)
        .filter(Boolean);
      if (failed.length > 0) {
        console.error(`[ClassChange] Cache invalidation partial fail ${userId?.substring(0, 8)}: ${failed.join(', ')}`);
        // 不阻斷：portrait 14d TTL 自動過期，push log cooldown 影響低
      }
    }

    console.log(`[ClassChange] ${userId?.substring(0, 8)} ${oldClass || '(null)'} → ${target || '(null)'} (source=${source}${skipRenewalReset ? ' skipRenewal' : ''}${skipCacheInvalidation ? ' skipCache' : ''})`);
    return { changed: true, oldClass, newClass: target };

  } catch (err) {
    console.error(`[ClassChange] performClassChange error ${userId?.substring(0, 8)}:`, err.message);
    return { changed: false, oldClass: null, newClass: target, error: err.message };
  }
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

    // === 續報自動換班：如果 Supabase 已有這個學員，走 performClassChange 統一入口 ===
    // 契約_續報記錄.md §5 T7 觸發源 A + 契約_系統規則.md §4 雷池洞 36 根治解
    if (s.className) {
      try {
        const sb = getSupabase();
        if (sb) {
          // 用 display_name 或 realName 比對已存在的學員
          const namesToMatch = [s.lineName];
          if (s.realName) namesToMatch.push(s.realName);

          let matched = false;
          let matchedUserId = null;
          for (const name of namesToMatch) {
            const { data: existing } = await sb.from('users')
              .select('id, class_name, display_name')
              .or(`display_name.eq.${name},intro.ilike.%${name}%`)
              .limit(5);

            if (existing && existing.length > 0) {
              for (const user of existing) {
                matched = true;
                if (!matchedUserId) matchedUserId = user.id;
                if (user.class_name !== s.className) {
                  // 走 performClassChange — 一次 helper call 統一所有 storage 同步
                  // （Supabase 5 欄位 + Redis profile + 6 個 cache key）
                  const result = await performClassChange(user.id, s.className, { source: 'auto' });
                  if (result.changed) {
                    reassigned++;
                    console.log(`[User] Auto reassigned ${user.display_name || user.id.substring(0, 8)} → ${s.className}`);
                  }
                }
              }
              break; // 比對到就不繼續
            }
          }

          // 回寫 preload.matched（staff 畫面才不會永遠顯示「等待加好友」）
          if (matched && matchedUserId) {
            const preloadKey = `${PRELOAD_PREFIX}${normalizedName}`;
            const preloadRecord = await r.get(preloadKey);
            if (preloadRecord && typeof preloadRecord === 'object' && !preloadRecord.matched) {
              preloadRecord.matched = true;
              preloadRecord.matchedUserId = matchedUserId;
              preloadRecord.matchedAt = new Date().toISOString();
              await r.set(preloadKey, preloadRecord);
            }
            // realName 索引也同步
            if (s.realName) {
              const normalizedReal = normalizeName(s.realName);
              if (normalizedReal) {
                const realKey = `${PRELOAD_REALNAME_PREFIX}${normalizedReal}`;
                const realRecord = await r.get(realKey);
                if (realRecord && typeof realRecord === 'object' && !realRecord.matched) {
                  realRecord.matched = true;
                  realRecord.matchedUserId = matchedUserId;
                  realRecord.matchedAt = new Date().toISOString();
                  await r.set(realKey, realRecord);
                }
              }
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
 * 判斷學員的班級狀態（用於結業控制）
 * @returns {'active'|'graduating'|'grace'|'expired'|null}
 *   active: 課程進行中
 *   graduating: 結業後 0-3 天（正常回覆 + AI 自然帶續報）
 *   grace: 結業後 4-10 天（寬限期，正常回覆）
 *   expired: 超過寬限期，鎖定
 *   null: 沒有班級資料
 */
// 班級狀態邏輯已搬到 lib/classes.js（含 Read-through + Soft delete）
// 這裡 re-export 保持向後相容，現有 import 不需改
export { getClassStatus, getActiveClassNames } from './classes.js';

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

  // 存入班級 — 走 performClassChange（首次配對 skip renewal reset + cache invalidation）
  if (preloaded.className) {
    await performClassChange(userId, preloaded.className, {
      source: 'preload-match-realname',
      skipRenewalReset: true,
      skipCacheInvalidation: true,
    });
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

  // 存入班級 — 走 performClassChange（首次配對 skip renewal reset + cache invalidation）
  if (preloaded.className) {
    await performClassChange(userId, preloaded.className, {
      source: 'preload-match',
      skipRenewalReset: true,
      skipCacheInvalidation: true,
    });
    console.log(`[User] className set: ${preloaded.className} for ${userId?.substring(0, 8)}`);
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
 * 手動分班後標記 preloaded 為已比對
 * 嘗試用 LINE 名稱和真名去找對應的 preloaded 記錄
 */
export async function markPreloadedMatched(userId, displayName, realName) {
  const r = getRedis();

  // 先用 LINE 名稱找
  const normalized = normalizeName(displayName);
  if (normalized) {
    const data = await r.get(`${PRELOAD_PREFIX}${normalized}`);
    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (!parsed.matched) {
        parsed.matched = true;
        parsed.matchedUserId = userId;
        parsed.matchedAt = new Date().toISOString();
        await r.set(`${PRELOAD_PREFIX}${normalized}`, parsed);
        console.log(`[User] Marked preloaded as matched: ${displayName} (by lineName)`);
        return true;
      }
    }
  }

  // 再用真名找
  if (realName) {
    const normalizedReal = normalizeName(realName);
    if (normalizedReal) {
      const data = await r.get(`${PRELOAD_REALNAME_PREFIX}${normalizedReal}`);
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (!parsed.matched) {
          parsed.matched = true;
          parsed.matchedUserId = userId;
          parsed.matchedAt = new Date().toISOString();
          await r.set(`${PRELOAD_REALNAME_PREFIX}${normalizedReal}`, parsed);
          // 同步更新 lineName 那筆
          const normalizedLine = normalizeName(parsed.lineName);
          if (normalizedLine) {
            await r.set(`${PRELOAD_PREFIX}${normalizedLine}`, parsed);
          }
          console.log(`[User] Marked preloaded as matched: ${realName} (by realName)`);
          return true;
        }
      }
    }
  }

  return false;
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
 * 根據用戶檔案和最近標籤，產生注入 System Prompt 的上下文
 * 支援用戶切片動態注入：AI 意圖分類決定該注入哪些切片
 *
 * 切片設計：
 * - identity：名字、性別、年齡、互動次數、關係階段（永遠注入）
 * - lifestyle：職業、工作型態、家庭、生活挑戰
 * - body_goal：身高體重、目標、性格特點
 * - coaching_trend：最近 coaching_tags（取代 journey/summary，永遠是最新狀態）
 *
 * @param {object|null} user - 用戶檔案
 * @param {Array|null} recentTags - 最近 coaching_tags（即時資料，取代 journey/summary）
 * @param {string[]|null} slices - AI 選取的用戶切片（null = 全部注入，向下相容）
 * @param {object|null} activeGoal - 當前活躍目標
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

// ====== 10. 班級互動統計（遊戲化用）======

const CLASS_STATS_PREFIX = 'coach-class-stats:';

/**
 * 取得班級互動統計
 * @param {string} className - 班級名稱
 * @param {string} [specificUserId] - 可選，取得特定用戶的個人貢獻
 * @returns {{ todayUniqueUsers, weekInteractions, weekUserContribution, studentCount, weekGoal }}
 */
export async function getClassStats(className, specificUserId = null) {
  const sb = getSupabase();
  if (!sb || !className) return null;

  try {
    // 台灣時間今天 00:00（轉 UTC）
    const twNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const todayStart = new Date(twNow);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);

    // 台灣時間本週一 00:00（轉 UTC）
    const dayOfWeek = twNow.getUTCDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(twNow);
    weekStart.setUTCDate(weekStart.getUTCDate() - mondayOffset);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekStartUTC = new Date(weekStart.getTime() - 8 * 60 * 60 * 1000);

    // 取得該班所有學員 ID
    const { data: classUsers } = await sb.from('users')
      .select('id')
      .eq('class_name', className);
    if (!classUsers || classUsers.length === 0) return null;

    const userIds = classUsers.map(u => u.id);
    const studentCount = userIds.length;
    const weekGoal = studentCount * 5; // 班級人數 × 5

    // 今天 distinct users（學員角色的對話）
    const { data: todayConvs } = await sb.from('conversations')
      .select('user_id')
      .eq('role', 'user')
      .gte('created_at', todayStartUTC.toISOString())
      .in('user_id', userIds);
    const todayUniqueUsers = new Set((todayConvs || []).map(c => c.user_id)).size;

    // 本週互動總次數（學員角色）
    const { data: weekConvs } = await sb.from('conversations')
      .select('user_id')
      .eq('role', 'user')
      .gte('created_at', weekStartUTC.toISOString())
      .in('user_id', userIds);
    const weekInteractions = (weekConvs || []).length;

    // 個人本週貢獻
    let weekUserContribution = 0;
    if (specificUserId) {
      weekUserContribution = (weekConvs || []).filter(c => c.user_id === specificUserId).length;
    }

    return { todayUniqueUsers, weekInteractions, weekUserContribution, studentCount, weekGoal };
  } catch (err) {
    console.error('[ClassStats] Error:', err.message);
    return null;
  }
}

/**
 * 判斷是否為今天第一次互動（台灣時間）
 */
export function isFirstInteractionToday(user) {
  if (!user?.stats?.lastInteractionAt) return true; // 從未互動 = 第一次
  const lastAt = new Date(user.stats.lastInteractionAt);
  const twNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const lastTW = new Date(lastAt.getTime() + 8 * 60 * 60 * 1000);
  return lastTW.toISOString().slice(0, 10) !== twNow.toISOString().slice(0, 10);
}
