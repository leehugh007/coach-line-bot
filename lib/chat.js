/**
 * 對話記憶模組
 *
 * 讓 AI 有上下文記憶，能接續對話
 * Redis key: coach-chat:{userId}
 * TTL: 30 分鐘
 * 最多保留 8 則訊息（4 輪對話）
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

const CHAT_PREFIX = 'coach-chat:';
const CHAT_TTL = 86400;     // 24 小時（一天的對話記憶）
const MAX_MESSAGES = 40;    // 最多 40 則（20 輪，涵蓋一天的來回討論）

const GROUP_PREFIX = 'coach-group:';
const GROUP_TTL = 7200;     // 2 小時（群組對話流動快，不需要太長）
const MAX_GROUP_MESSAGES = 20; // 保留最近 20 則

/**
 * 取得對話歷史（Redis 優先，miss 時從 Supabase 回補）
 */
export async function getChatHistory(userId) {
  try {
    const r = getRedis();
    const data = await r.get(`${CHAT_PREFIX}${userId}`);
    if (data?.messages?.length > 0) return data.messages;

    // Redis miss → 從 Supabase 回補最近對話
    return await restoreChatFromSupabase(userId);
  } catch (err) {
    console.error('[Chat] getChatHistory error:', err);
    return [];
  }
}

/**
 * 從 Supabase 恢復對話歷史到 Redis
 */
async function restoreChatFromSupabase(userId) {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('conversations')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_MESSAGES);

    if (error || !data || data.length === 0) return [];

    // Supabase 回來的是倒序，翻轉成正序
    const messages = data.reverse().map(row => ({
      role: row.role,
      content: row.content,
      timestamp: new Date(row.created_at).getTime(),
    }));

    // 回寫 Redis（帶 TTL）
    const r = getRedis();
    await r.set(`${CHAT_PREFIX}${userId}`, {
      messages,
      updatedAt: Date.now(),
    }, { ex: CHAT_TTL });

    console.log(`[Chat] Restored ${messages.length} messages from Supabase for ${userId?.substring(0, 8)}`);
    return messages;
  } catch (err) {
    console.error('[Chat] restoreFromSupabase error:', err);
    return [];
  }
}

/**
 * 新增訊息到對話歷史（Redis + Supabase 雙寫）
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

    // 非阻塞寫入 Supabase
    syncConversationToSupabase(userId, role, content).catch(err =>
      console.error('[Chat] Supabase sync error:', err)
    );
  } catch (err) {
    console.error('[Chat] addChatMessage error:', err);
  }
}

/**
 * 同步對話到 Supabase
 */
async function syncConversationToSupabase(userId, role, content) {
  const sb = getSupabase();
  if (!sb) return;

  const { error } = await sb.from('conversations').insert({
    user_id: userId,
    role,
    content,
  });
  if (error) console.error('[Chat] Supabase insert error:', error.message);
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
 * 只送最近 N 則（預設 8 則 = 4 輪），節省 input tokens
 * 長期記憶靠旅程摘要 + 標籤系統覆蓋，不需要送完整歷史
 */
export function formatChatForGemini(chatHistory, maxMessages = 8) {
  if (!chatHistory || chatHistory.length === 0) return [];
  const recent = chatHistory.slice(-maxMessages);
  return recent.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));
}
