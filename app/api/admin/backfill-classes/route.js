/**
 * Backfill API：把 Redis 既有班級資料同步到 Supabase classes 表
 *
 * 對應契約_系統規則.md §3.5 階段 D（一次性執行）
 *
 * 用法：
 *   curl -X POST -H "x-admin-key: $ADMIN_API_KEY" \
 *        https://coach-line-bot.vercel.app/api/admin/backfill-classes
 *
 * 回傳：{ ok, total, succeeded, failed: [{name, error}] }
 *
 * 安全性：冪等（upsert），重跑不會出錯
 */

import { NextResponse } from 'next/server';
import { backfillClassesToSupabase } from '@/lib/classes';

export const maxDuration = 60;

function checkAuth(request) {
  const key = request.headers.get('x-admin-key') || request.headers.get('x-staff-key');
  return key === process.env.ADMIN_API_KEY || key === process.env.STAFF_API_KEY;
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await backfillClassesToSupabase();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[BackfillClasses] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
