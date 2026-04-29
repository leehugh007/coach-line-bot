/**
 * 班級資料管理 — coach-line-bot
 *
 * 對應契約：契約_系統規則.md §3（資料持久化）+ §4（命名）+ §5（Cron 觸發）
 *
 * Redis key: coach-class:{className}（內部 camelCase）
 * Supabase table: classes（snake_case + soft delete）
 *
 * Write-through: Redis 同步寫 + Supabase 非阻塞 upsert
 * Read-through: Redis miss → Supabase（WHERE deleted_at IS NULL）→ 回寫 Redis
 * Soft delete: deleteClass 寫 deleted_at，誤刪可救（一休 2026-04-30 決策）
 */

import { Redis } from '@upstash/redis';
import { getSupabase } from './supabase.js';

const CLASS_PREFIX = 'coach-class:';
const CLASS_INDEX = 'coach-classes-index';

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

// Supabase row → Redis JSON (snake_case → camelCase)
function normalizeFromSupabase(row) {
  if (!row) return null;
  return {
    startDate: row.start_date,
    endDate: row.end_date,
    weeks: row.weeks ?? 12,
    pauseStart: row.pause_start,
    pauseEnd: row.pause_end,
    createdAt: row.created_at,
  };
}

// Redis JSON → Supabase upsert payload (camelCase → snake_case)
function normalizeToSupabase(className, redisData) {
  return {
    class_name: className,
    start_date: redisData.startDate,
    end_date: redisData.endDate || null,
    weeks: redisData.weeks ?? 12,
    pause_start: redisData.pauseStart || null,
    pause_end: redisData.pauseEnd || null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
}

/**
 * 取得班級資料（Read-through：Redis miss → Supabase → 回寫 Redis）
 */
export async function getClass(className) {
  if (!className) return null;
  const r = getRedis();

  try {
    const cached = await r.get(`${CLASS_PREFIX}${className}`);
    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }
  } catch (err) {
    console.error('[Class] Redis get error:', err.message);
  }

  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from('classes')
      .select('*')
      .eq('class_name', className)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return null;

    const redisData = normalizeFromSupabase(data);

    try {
      await r.set(`${CLASS_PREFIX}${className}`, JSON.stringify(redisData));
      await r.sadd(CLASS_INDEX, className);
      console.log(`[Class] Restored ${className} from Supabase`);
    } catch (e) { /* 回寫失敗不影響回傳 */ }

    return redisData;
  } catch (err) {
    console.error('[Class] Supabase fallback error:', err.message);
    return null;
  }
}

/**
 * 寫入班級資料（Write-through：Redis 同步 + Supabase 非阻塞）
 */
export async function saveClass(className, data) {
  if (!className) throw new Error('className required');
  if (!data?.startDate) throw new Error('startDate required');

  const r = getRedis();
  const redisData = {
    startDate: data.startDate,
    endDate: data.endDate || null,
    weeks: data.weeks ?? 12,
    pauseStart: data.pauseStart || null,
    pauseEnd: data.pauseEnd || null,
    createdAt: data.createdAt || new Date().toISOString(),
  };

  await r.set(`${CLASS_PREFIX}${className}`, JSON.stringify(redisData));
  await r.sadd(CLASS_INDEX, className);

  syncToSupabase(className, redisData).catch(err =>
    console.error('[Class] Supabase sync error:', err.message)
  );

  return redisData;
}

async function syncToSupabase(className, redisData) {
  const sb = getSupabase();
  if (!sb) return;
  const payload = normalizeToSupabase(className, redisData);
  const { error } = await sb
    .from('classes')
    .upsert(payload, { onConflict: 'class_name' });
  if (error) {
    console.error('[Class] upsert error:', error.message);
  }
}

/**
 * 刪除班級（soft delete：Redis 刪 + Supabase 標記 deleted_at）
 */
export async function deleteClass(className) {
  if (!className) return false;
  const r = getRedis();

  await r.del(`${CLASS_PREFIX}${className}`);
  await r.srem(CLASS_INDEX, className);

  try {
    const sb = getSupabase();
    if (sb) {
      const { error } = await sb
        .from('classes')
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('class_name', className);
      if (error) console.error('[Class] soft delete error:', error.message);
    }
  } catch (err) {
    console.error('[Class] deleteClass Supabase error:', err.message);
  }

  return true;
}

/**
 * 取得班級結業狀態（從 user.js 搬過來，內部走 getClass 享受 read-through）
 *
 * 回傳：
 *   active: 課程進行中
 *   graduating: 結業後 0-3 天
 *   grace: 結業後 4-10 天
 *   expired: 超過寬限期
 *   null: 沒有班級資料
 */
export async function getClassStatus(className) {
  if (!className) return null;
  const data = await getClass(className);
  if (!data) return null;
  if (!data.endDate) return 'active';

  const now = new Date();
  const endDate = new Date(data.endDate);
  const daysSinceEnd = Math.floor((now - endDate) / 86400000);

  if (daysSinceEnd < 0) return 'active';
  if (daysSinceEnd <= 3) return 'graduating';
  if (daysSinceEnd <= 10) return 'grace';
  return 'expired';
}

/**
 * 取得目前進行中的班級名稱列表
 */
export async function getActiveClassNames() {
  const r = getRedis();
  const allNames = await r.smembers(CLASS_INDEX);
  if (!allNames || allNames.length === 0) return [];

  const now = new Date();
  const active = [];
  for (const cn of allNames) {
    const cd = await getClass(cn);
    if (cd) {
      const start = new Date(cd.startDate);
      const end = cd.endDate ? new Date(cd.endDate) : null;
      if (now >= start && (!end || now <= end)) active.push(cn);
    }
  }
  return active;
}

/**
 * 列出所有班級（用於後台 GET /api/staff/classes）
 *
 * 從 Supabase 讀為主（避免 Redis index 跟 Supabase 不同步），
 * Supabase 不通時 fallback 到 Redis。
 */
export async function listAllClasses() {
  try {
    const sb = getSupabase();
    if (sb) {
      const { data, error } = await sb
        .from('classes')
        .select('*')
        .is('deleted_at', null)
        .order('start_date', { ascending: false });
      if (!error && data) {
        return data.map(row => ({
          name: row.class_name,
          ...normalizeFromSupabase(row),
        }));
      }
      console.error('[Class] listAllClasses Supabase error:', error?.message);
    }
  } catch (err) {
    console.error('[Class] listAllClasses exception:', err.message);
  }

  // Fallback: Redis index
  const r = getRedis();
  const names = await r.smembers(CLASS_INDEX);
  const list = [];
  for (const cn of names || []) {
    const c = await getClass(cn);
    if (c) list.push({ name: cn, ...c });
  }
  return list;
}

/**
 * Backfill：把 Redis 既有班級資料寫進 Supabase（一次性，給 admin endpoint 用）
 */
export async function backfillClassesToSupabase() {
  const r = getRedis();
  const names = await r.smembers(CLASS_INDEX);
  if (!names || names.length === 0) {
    return { total: 0, succeeded: 0, failed: [] };
  }

  const result = { total: names.length, succeeded: 0, failed: [] };

  for (const name of names) {
    try {
      const data = await r.get(`${CLASS_PREFIX}${name}`);
      if (!data) {
        result.failed.push({ name, error: 'Redis miss' });
        continue;
      }
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      await syncToSupabase(name, parsed);
      result.succeeded++;
    } catch (err) {
      result.failed.push({ name, error: err.message });
    }
  }

  return result;
}
