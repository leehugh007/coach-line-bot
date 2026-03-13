/**
 * 訊息佇列模組 — 連續訊息合併
 *
 * 解決問題：學員在 LINE 分多條發送同一個問題（例如三條訊息問水果），
 * 每條被當獨立訊息處理，導致 AI 看不到完整上下文。
 *
 * 機制：Redis buffer + 延遲處理
 * - 每條訊息先存入 buffer
 * - 等 3 秒確認沒有新訊息
 * - 再等 5 秒讓用戶打完（共 8 秒）
 * - 合併所有訊息，一次處理
 *
 * 從 abc-line-bot 移植，簡化版（純文字，無照片處理）
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

const BUF_PREFIX = 'coach-buf:';
const BUF_TTL = 120; // 緩衝區 2 分鐘後自動清除

export const BATCH_DELAY = 3000;       // 基礎等待 3 秒
export const TEXT_EXTRA_DELAY = 5000;  // 再等 5 秒讓用戶打完（共 8 秒）

/**
 * 將訊息存入 Redis buffer
 * @returns {number} buffer 中的訊息數量
 */
export async function bufferMessage(userId, msg) {
  const r = getRedis();
  const key = `${BUF_PREFIX}${userId}`;
  const lockKey = `lock:write:${key}`;

  // 寫入鎖（防止並發寫入衝突）
  let locked = false;
  for (let i = 0; i < 10; i++) {
    locked = await r.set(lockKey, '1', { nx: true, ex: 5 });
    if (locked) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  try {
    const existing = await r.get(key) || { messages: [], updatedAt: 0 };
    existing.messages.push(msg);
    existing.updatedAt = Date.now();

    await r.set(key, existing, { ex: BUF_TTL });
    return existing.messages.length;
  } finally {
    if (locked) await r.del(lockKey);
  }
}

/**
 * 檢查 buffer 是否已安靜夠久（沒有新訊息進來）
 */
export async function isBufferReady(userId, threshold = BATCH_DELAY - 500) {
  const r = getRedis();
  const key = `${BUF_PREFIX}${userId}`;
  const data = await r.get(key);

  if (!data || data.messages.length === 0) return false;
  return (Date.now() - data.updatedAt) >= threshold;
}

/**
 * 取出 buffer 並清空（原子操作，有鎖保護）
 * @returns {{ messages: Array, updatedAt: number } | null}
 */
export async function consumeBuffer(userId) {
  const r = getRedis();
  const key = `${BUF_PREFIX}${userId}`;
  const lockKey = `lock:consume:${key}`;

  const locked = await r.set(lockKey, '1', { nx: true, ex: 10 });
  if (!locked) {
    console.log(`[Buffer] ${userId?.substring(0, 8)}: lock exists, another process consuming`);
    return null;
  }

  try {
    const data = await r.get(key);
    if (!data || data.messages.length === 0) return null;

    await r.del(key);
    return data;
  } finally {
    await r.del(lockKey);
  }
}
