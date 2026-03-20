/**
 * 主動關心 API — 批次推播個人化關心訊息給學員
 *
 * POST /api/admin/outreach
 * Body: { users: [{ id, name }], message: string, quickReply?: [{ label, text }] }
 * → 逐筆替換 {name} → pushMessage/pushWithQuickReply → 存入 chatHistory
 */

import { pushMessage, pushWithQuickReply } from '@/lib/line';
import { addChatMessage } from '@/lib/chat';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

function getRedis() {
  return new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
}

function authCheck(request) {
  const key = request.headers.get('x-admin-key') || request.headers.get('x-staff-key');
  return key === process.env.ADMIN_API_KEY || key === process.env.STAFF_API_KEY;
}

/**
 * GET /api/admin/outreach — 取得最近推播紀錄
 */
export async function GET(request) {
  if (!authCheck(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const r = getRedis();
    const raw = await r.lrange('coach-push-history', 0, 99);
    const logs = (raw || []).map(item => {
      try { return typeof item === 'string' ? JSON.parse(item) : item; } catch { return null; }
    }).filter(Boolean);
    return NextResponse.json({ ok: true, logs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!authCheck(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { users, message, quickReply } = body;

  if (!users || !Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ error: '請選擇至少一位學員' }, { status: 400 });
  }
  if (!message || !message.trim()) {
    return NextResponse.json({ error: '訊息不能為空' }, { status: 400 });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (const user of users) {
    try {
      const personalizedMsg = message.trim().replace(/\{name\}/g, user.name || '同學');

      if (quickReply && quickReply.length > 0) {
        // 有 Quick Reply → 用 pushWithQuickReply
        const personalizedQR = quickReply.map(item => ({
          label: item.label.replace(/\{name\}/g, user.name || '同學'),
          text: (item.text || item.label).replace(/\{name\}/g, user.name || '同學'),
        }));
        await pushWithQuickReply(user.id, personalizedMsg, personalizedQR);
      } else {
        await pushMessage(user.id, personalizedMsg);
      }

      // 存入對話歷史，讓學員回覆時 AI 知道上下文
      await addChatMessage(user.id, 'assistant', personalizedMsg);

      // 記錄推播歷史
      try {
        const r = getRedis();
        const entry = JSON.stringify({ ts: new Date().toISOString(), name: user.name || '同學', type: '主動關心', preview: personalizedMsg.substring(0, 80) });
        await r.lpush('coach-push-history', entry);
        await r.ltrim('coach-push-history', 0, 99);
      } catch (_) {}

      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ name: user.name || user.id?.substring(0, 8), error: err.message });
      console.error(`[Outreach] Push failed for ${user.name || user.id?.substring(0, 8)}:`, err.message);
    }
  }

  console.log(`[Outreach] Done: ${results.sent} sent, ${results.failed} failed`);
  return NextResponse.json({ ok: true, ...results });
}
