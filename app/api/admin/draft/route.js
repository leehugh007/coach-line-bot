/**
 * 手動草稿生成 API
 *
 * POST → { message, studentName? } → 用更新後的知識庫產生草稿回覆
 */

import { generateDraftResponse } from '@/lib/ai';
import { NextResponse } from 'next/server';

function checkAuth(request) {
  const key = request.headers.get('x-admin-key');
  return key === process.env.ADMIN_API_KEY;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { message, studentName } = await request.json();

    if (!message || !message.trim()) {
      return NextResponse.json({ error: '請輸入訊息內容' }, { status: 400 });
    }

    const studentContext = studentName ? `學員名字：${studentName}` : '';
    const draft = await generateDraftResponse(message.trim(), studentContext);

    if (!draft) {
      return NextResponse.json({ error: 'AI 產生草稿失敗，請重試' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    console.error('[Draft API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
