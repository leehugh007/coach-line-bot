/**
 * 對話記憶模組
 *
 * 讓 AI 有上下文記憶，能接續對話
 * Redis key: coach-chat:{userId}
 * TTL: 30 分鐘
 * 最多保留 8 則訊息（4 輪對話）
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

const CHAT_PREFIX = 'coach-chat:';
const CHAT_TTL = 1800;     // 30 分鐘
const MAX_MESSAGES = 8;     // 最多 8 則（4 輪）

/**
 * 取得對話歷史
 */
export async function getChatHistory(userId) {
  try {
    const r = getRedis();
    const data = await r.get(`${CHAT_PREFIX}${userId}`);
    return data?.messages || [];
  } catch (err) {
    console.error('[Chat] getChatHistory error:', err);
    return [];
  }
}

/**
 * 新增訊息到對話歷史
 */
export async function addChatMessage(userId, role, content) {
  try {
    const r = getRedis();
    const key = `${CHAT_PREFIX}${userId}`;
    const data = await r.get(key) || { messages: [], updatedAt: 0 };

    data.messages.push({
      role,
      content,
      timestamp: Date.now(),
    });

    if (data.messages.length > MAX_MESSAGES) {
      data.messages = data.messages.slice(-MAX_MESSAGES);
    }

    data.updatedAt = Date.now();
    await r.set(key, data, { ex: CHAT_TTL });
  } catch (err) {
    console.error('[Chat] addChatMessage error:', err);
  }
}

/**
 * 格式化成 Gemini contents 格式
 */
export function formatChatForGemini(chatHistory) {
  if (!chatHistory || chatHistory.length === 0) return [];
  return chatHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}
