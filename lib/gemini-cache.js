/**
 * Gemini Context Caching 管理模組（小幫手版）
 *
 * 從阿算移植，機制相同：
 *   1. 第一次 call 時建立 cache，存 name 到 Redis
 *   2. 後續 call 從 Redis 取 cache name，直接引用
 *   3. TTL 到期後下一次 call 自動重建
 *   4. 任何失敗都 fallback 到原本流程（不影響用戶）
 *
 * 小幫手策略：共用 cache（只 cache SYSTEM_PROMPT，不含 per-user context）
 *   - SYSTEM_PROMPT 5,714 tokens 佔 input 74%，效果好
 *   - knowledge + userContext 每次不同，放到 contents
 *
 * 環境變數：CONTEXT_CACHE_ENABLED=true 開啟
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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CACHE_TTL_SECONDS = 3600; // 1 小時
const REDIS_TTL_BUFFER = 60;   // Redis key 比 cache TTL 早 60 秒過期

/**
 * 取得或建立 Gemini Context Cache
 *
 * @param {string} cacheKey - Redis key 後綴（如 'coach-private'）
 * @param {string} model - Gemini 模型名
 * @param {string} systemPrompt - 要 cache 的 system prompt
 * @returns {Promise<string|null>} cache name，失敗回傳 null
 */
export async function getOrCreateCache(cacheKey, model, systemPrompt) {
  if (process.env.CONTEXT_CACHE_ENABLED !== 'true') {
    return null;
  }

  const r = getRedis();
  const modelKey = model.replace(/^gemini-/, '');
  const redisKey = `gemini-cache:${modelKey}:${cacheKey}`;

  try {
    // 1. 查 Redis 有沒有現成的 cache name
    const existing = await r.get(redisKey);
    if (existing) {
      return existing;
    }

    // 2. 沒有就建立新 cache
    const cacheName = await createCache(model, systemPrompt);
    if (!cacheName) {
      return null;
    }

    // 3. 存到 Redis（TTL = cache TTL - buffer）
    const redisTtl = CACHE_TTL_SECONDS - REDIS_TTL_BUFFER;
    await r.set(redisKey, cacheName, { ex: redisTtl });
    console.log(`[Cache] Created ${cacheKey}: ${cacheName} (TTL ${CACHE_TTL_SECONDS}s)`);

    return cacheName;
  } catch (err) {
    console.error(`[Cache] getOrCreateCache error for ${cacheKey}:`, err.message);
    return null;
  }
}

/**
 * 呼叫 Gemini API 建立 CachedContent
 */
async function createCache(model, systemPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${GEMINI_API_KEY}`;

  const body = {
    model: `models/${model}`,
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    ttl: `${CACHE_TTL_SECONDS}s`,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Cache] Create failed (${res.status}):`, errText.substring(0, 300));
    return null;
  }

  const data = await res.json();
  return data.name || null;
}
