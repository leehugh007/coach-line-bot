/**
 * 群組問題待回應管理
 *
 * 教練無法即時回覆群組時，Bot 偵測學員問題 → 產生草稿 → 存入待回應
 * 教練到後台查看，複製草稿後到群組手動 tag 學員回覆
 *
 * Redis key: coach-pending:items (LIST，新的在前)
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

const PENDING_KEY = 'coach-pending:items';
const MAX_PENDING = 100; // 最多保留 100 筆

/**
 * 產生簡短唯一 ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
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
    userId: item.userId,
    studentName: item.studentName || '未知',
    message: item.message,
    topic: item.topic || 'other',
    draft: item.draft,
    createdAt: new Date().toISOString(),
  };

  // LPUSH：新的在前面
  await r.lpush(PENDING_KEY, JSON.stringify(record));

  // 限制數量，超過的自動移除
  await r.ltrim(PENDING_KEY, 0, MAX_PENDING - 1);

  console.log(`[Pending] Saved: ${record.studentName} (${record.topic})`);
  return id;
}

/**
 * 取得所有待回應項目（新的在前）
 * @returns {Array} 待回應項目清單
 */
export async function getPendingItems() {
  const r = getRedis();

  const raw = await r.lrange(PENDING_KEY, 0, -1);
  if (!raw || raw.length === 0) return [];

  return raw.map(item => {
    if (typeof item === 'string') {
      try { return JSON.parse(item); } catch { return null; }
    }
    return item; // Upstash 可能已自動解析
  }).filter(Boolean);
}

/**
 * 標記完成（移除單筆）
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

  console.log(`[Pending] Cleared all: ${count} items`);
  return count;
}
