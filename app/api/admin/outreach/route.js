/**
 * 主動關心 API — 批次推播個人化關心訊息給學員
 *
 * POST /api/admin/outreach
 * Body: { users: [{ id, name }], message: string }
 * → 逐筆替換 {name} → pushMessage → 存入 chatHistory（讓學員回覆時 AI 有上下文）
 */

import { pushMessage } from '@/lib/line';
import { addChatMessage } from '@/lib/chat';
import { NextResponse } from 'next/server';

function authCheck(request) {
  const key = request.headers.get('x-admin-key');
  return key === process.env.ADMIN_API_KEY;
}

export async function POST(request) {
  if (!authCheck(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { users, message } = body;

  if (!users || !Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ error: '請選擇至少一位學員' }, { status: 400 });
  }
  if (!message || !message.trim()) {
    return NextResponse.json({ error: '訊息不能為空' }, { status: 400 });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (const user of users) {
    try {
      // 替換 {name} 為學員名字
      const personalizedMsg = message.trim().replace(/\{name\}/g, user.name || '同學');
      await pushMessage(user.id, personalizedMsg);
      // 存入對話歷史，讓學員回覆時 AI 知道上下文
      await addChatMessage(user.id, 'assistant', personalizedMsg);
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
