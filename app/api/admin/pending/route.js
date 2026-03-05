/**
 * 群組問題待回應 API
 *
 * GET  → 回傳所有待回應項目
 * POST → { action: 'dismiss', id } 標記完成
 *        { action: 'clear' } 清空全部
 */

import { getPendingItems, dismissItem, clearAllPending } from '@/lib/pending';
import { NextResponse } from 'next/server';

function checkAuth(request) {
  const key = request.headers.get('x-admin-key');
  return key === process.env.ADMIN_API_KEY;
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const items = await getPendingItems();
    return NextResponse.json({ ok: true, items, count: items.length });
  } catch (err) {
    console.error('[Pending API] GET error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, id } = body;

    if (action === 'dismiss') {
      if (!id) {
        return NextResponse.json({ error: '缺少 id' }, { status: 400 });
      }
      const success = await dismissItem(id);
      if (!success) {
        return NextResponse.json({ error: '找不到該項目' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, message: '已標記完成' });
    }

    if (action === 'clear') {
      const count = await clearAllPending();
      return NextResponse.json({ ok: true, message: `已清空 ${count} 筆`, cleared: count });
    }

    return NextResponse.json({ error: '未知 action' }, { status: 400 });
  } catch (err) {
    console.error('[Pending API] POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
