/**
 * LINE Messaging API 工具函數
 */

import crypto from 'crypto';

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_API_BASE = 'https://api.line.me/v2/bot';

/**
 * 驗證 LINE Webhook 簽名
 */
export function verifySignature(body, signature) {
  const hash = crypto
    .createHmac('SHA256', CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
}

/**
 * Reply API（免費）
 */
export async function replyMessage(replyToken, messages) {
  if (!Array.isArray(messages)) {
    messages = [{ type: 'text', text: messages }];
  }

  const res = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Reply failed: ${res.status} ${error}`);
  }
  return { method: 'reply' };
}

/**
 * Push API（fallback）
 */
export async function pushMessage(userId, messages) {
  if (!Array.isArray(messages)) {
    messages = [{ type: 'text', text: messages }];
  }

  const res = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to: userId, messages }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Push failed: ${res.status} ${error}`);
  }
  return { method: 'push' };
}

/**
 * 取得用戶 LINE Profile（顯示名稱、頭貼等）
 */
export async function getProfile(userId) {
  try {
    const res = await fetch(`${LINE_API_BASE}/profile/${userId}`, {
      headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` },
    });
    if (!res.ok) return null;
    return await res.json(); // { userId, displayName, pictureUrl, statusMessage }
  } catch (err) {
    console.error('[LINE] getProfile error:', err);
    return null;
  }
}

/**
 * 取得群組成員 Profile
 */
export async function getGroupMemberProfile(groupId, userId) {
  try {
    const res = await fetch(`${LINE_API_BASE}/group/${groupId}/member/${userId}`, {
      headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[LINE] getGroupMemberProfile error:', err);
    return null;
  }
}

/**
 * 回覆訊息（Reply 優先，Push fallback）
 */
export async function sendMessage(replyToken, userId, messages) {
  try {
    return await replyMessage(replyToken, messages);
  } catch (err) {
    console.warn('Reply failed, falling back to Push:', err.message);
    return await pushMessage(userId, messages);
  }
}
