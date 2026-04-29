/**
 * 群組問題待回應管理
 *
 * 教練無法即時回覆群組時，Bot 偵測學員問題 → 產生草稿 → 存入待回應
 * 教練到後台查看，複製草稿後到群組手動 tag 學員回覆
 *
 * Redis key: coach-pending:items (LIST，新的在前) — 快取
 * Supabase table: pending_responses — 真相
 *
 * 對齊契約 §3.5 #3：A 類業務關鍵資料 = Write-through + Read-through
 *   Write-through: Redis LPUSH 同步 + Supabase INSERT 非阻塞
 *   Read-through: Redis miss → Supabase WHERE status='pending' → 回寫 Redis
 *   Soft delete: dismiss/clear 寫 status，不真的刪 Supabase row
 */

import { Redis } from '@upstash/redis';
import { getSupabase } from './supabase.js';

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

const PENDING_KEY = 'coach-pending:items';
const MAX_PENDING = 100; // 最多保留 100 筆

/**
 * 產生簡短唯一 ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// Redis JSON record → Supabase upsert payload
function recordToSupabase(record) {
  return {
    redis_id: record.id,
    group_id: record.groupId,
    group_name: record.groupName || null,
    user_id: record.userId,
    student_name: record.studentName || null,
    message: record.message,
    topic: record.topic || null,
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    draft: record.draft || null,
    status: 'pending',
    created_at: record.createdAt,
    updated_at: new Date().toISOString(),
  };
}

// Supabase row → Redis JSON record
function recordFromSupabase(row) {
  return {
    id: row.redis_id,
    groupId: row.group_id,
    groupName: row.group_name || '',
    userId: row.user_id,
    studentName: row.student_name || '未知',
    message: row.message,
    topic: row.topic || 'other',
    confidence: row.confidence ?? 0,
    draft: row.draft || '',
    createdAt: row.created_at,
  };
}

async function syncSaveToSupabase(record) {
  const sb = getSupabase();
  if (!sb) return;
  const payload = recordToSupabase(record);
  const { error } = await sb
    .from('pending_responses')
    .upsert(payload, { onConflict: 'redis_id' });
  if (error) console.error('[Pending] Supabase upsert error:', error.message);
}

/**
 * 儲存一筆待回應項目
 *
 * @param {object} item
 *   - groupId: LINE 群組 ID
 *   - userId: 學員 LINE userId
 *   - studentName: 學員名稱
 *   - message: 原始訊息
 *   - topic: 問題類型 (mindset/diet/emotion/other)
 *   - draft: AI 草稿回覆
 * @returns {string} 項目 ID
 */
export async function savePendingItem(item) {
  const r = getRedis();
  const id = generateId();

  const record = {
    id,
    groupId: item.groupId,
    groupName: item.groupName || '',
    userId: item.userId,
    studentName: item.studentName || '未知',
    message: item.message,
    topic: item.topic || 'other',
    confidence: item.confidence || 0,
    draft: item.draft,
    createdAt: new Date().toISOString(),
  };

  // LPUSH：新的在前面
  await r.lpush(PENDING_KEY, JSON.stringify(record));

  // 限制數量，超過的自動移除
  await r.ltrim(PENDING_KEY, 0, MAX_PENDING - 1);

  // Write-through：非阻塞寫 Supabase（失敗不影響回應）
  syncSaveToSupabase(record).catch(err =>
    console.error('[Pending] Supabase sync error:', err.message)
  );

  console.log(`[Pending] Saved: ${record.studentName} (${record.topic})`);
  return id;
}

/**
 * 取得所有待回應項目（新的在前）
 *
 * Read-through：Redis miss → Supabase pending → 回寫 Redis
 * @returns {Array} 待回應項目清單
 */
export async function getPendingItems() {
  const r = getRedis();

  const raw = await r.lrange(PENDING_KEY, 0, -1);

  if (raw && raw.length > 0) {
    return raw.map(item => {
      if (typeof item === 'string') {
        try { return JSON.parse(item); } catch { return null; }
      }
      return item; // Upstash 可能已自動解析
    }).filter(Boolean);
  }

  // Redis miss → Supabase fallback（status='pending'，新的在前）
  try {
    const sb = getSupabase();
    if (!sb) return [];

    const { data, error } = await sb
      .from('pending_responses')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(MAX_PENDING);

    if (error) {
      console.error('[Pending] Read-through Supabase error:', error.message);
      return [];
    }
    if (!data || data.length === 0) return [];

    const records = data.map(recordFromSupabase);

    // 回寫 Redis（reverse 因為 LPUSH 會倒序，原序 = 新在前）
    try {
      const pipeline = r.pipeline();
      for (const rec of records.slice().reverse()) {
        pipeline.lpush(PENDING_KEY, JSON.stringify(rec));
      }
      pipeline.ltrim(PENDING_KEY, 0, MAX_PENDING - 1);
      await pipeline.exec();
      console.log(`[Pending] Read-through restored ${records.length} items from Supabase`);
    } catch (e) {
      console.error('[Pending] Read-through write-back error:', e.message);
    }

    return records;
  } catch (err) {
    console.error('[Pending] Read-through exception:', err.message);
    return [];
  }
}

/**
 * 標記完成（移除單筆 + Supabase 標 dismissed）
 * @param {string} id - 項目 ID
 * @returns {boolean} 是否成功
 */
export async function dismissItem(id) {
  const r = getRedis();

  const all = await getPendingItems();
  const filtered = all.filter(item => item.id !== id);

  if (filtered.length === all.length) return false; // 沒找到

  // 清空並重寫
  await r.del(PENDING_KEY);
  if (filtered.length > 0) {
    const pipeline = r.pipeline();
    for (const item of filtered.reverse()) { // reverse 因為 LPUSH 會倒序
      pipeline.lpush(PENDING_KEY, JSON.stringify(item));
    }
    await pipeline.exec();
  }

  // Soft delete：Supabase 寫 status='dismissed'（非阻塞）
  (async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb
      .from('pending_responses')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('redis_id', id);
    if (error) console.error('[Pending] Supabase dismiss error:', error.message);
  })().catch(err => console.error('[Pending] dismiss async error:', err.message));

  console.log(`[Pending] Dismissed: ${id}`);
  return true;
}

/**
 * 清空所有待回應項目
 * @returns {number} 清除的筆數
 */
export async function clearAllPending() {
  const r = getRedis();
  const all = await getPendingItems();
  const count = all.length;

  await r.del(PENDING_KEY);

  // Soft delete：Supabase 全部 pending 標 cleared（非阻塞）
  (async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb
      .from('pending_responses')
      .update({ status: 'cleared', updated_at: new Date().toISOString() })
      .eq('status', 'pending');
    if (error) console.error('[Pending] Supabase clear error:', error.message);
  })().catch(err => console.error('[Pending] clear async error:', err.message));

  console.log(`[Pending] Cleared all: ${count} items`);
  return count;
}

/**
 * Backfill：把 Redis LIST 既有資料寫進 Supabase（一次性，給 admin endpoint 用）
 *
 * 不依賴 read-through，避免循環。直接讀 Redis 原始 → upsert。
 * @returns {object} { total, succeeded, failed }
 */
export async function backfillPendingToSupabase() {
  const r = getRedis();
  const raw = await r.lrange(PENDING_KEY, 0, -1);
  if (!raw || raw.length === 0) {
    return { total: 0, succeeded: 0, failed: [] };
  }

  const records = raw.map(item => {
    if (typeof item === 'string') {
      try { return JSON.parse(item); } catch { return null; }
    }
    return item;
  }).filter(Boolean);

  const result = { total: records.length, succeeded: 0, failed: [] };
  const sb = getSupabase();
  if (!sb) {
    return { ...result, failed: records.map(r => ({ id: r.id, error: 'Supabase not configured' })) };
  }

  for (const rec of records) {
    try {
      await syncSaveToSupabase(rec);
      result.succeeded++;
    } catch (err) {
      result.failed.push({ id: rec.id, error: err.message });
    }
  }

  return result;
}
