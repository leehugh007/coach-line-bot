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
const CHAT_TTL = 86400;     // 24 小時（一天的對話記憶）
const MAX_MESSAGES = 40;    // 最多 40 則（20 輪，涵蓋一天的來回討論）

const GROUP_PREFIX = 'coach-group:';
const GROUP_TTL = 7200;     // 2 小時（群組對話流動快，不需要太長）
const MAX_GROUP_MESSAGES = 20; // 保留最近 20 則

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

// ===== 群組訊息 Buffer =====

/**
 * 新增一則群組訊息到 buffer
 */
export async function addGroupMessage(groupId, userId, displayName, text) {
  try {
    const r = getRedis();
    const key = `${GROUP_PREFIX}${groupId}`;
    const data = await r.get(key) || { messages: [] };

    data.messages.push({
      userId,
      name: displayName || '未知',
      text,
      ts: Date.now(),
    });

    if (data.messages.length > MAX_GROUP_MESSAGES) {
      data.messages = data.messages.slice(-MAX_GROUP_MESSAGES);
    }

    await r.set(key, data, { ex: GROUP_TTL });
  } catch (err) {
    console.error('[Chat] addGroupMessage error:', err);
  }
}

/**
 * 取得群組近期訊息（用於 AI 偵測上下文）
 * @returns {Array} [{ userId, name, text, ts }]
 */
export async function getGroupContext(groupId) {
  try {
    const r = getRedis();
    const data = await r.get(`${GROUP_PREFIX}${groupId}`);
    return data?.messages || [];
  } catch (err) {
    console.error('[Chat] getGroupContext error:', err);
    return [];
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
