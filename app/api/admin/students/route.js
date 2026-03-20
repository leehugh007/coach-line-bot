/**
 * 學員管理 API
 *
 * POST /api/admin/students — 更新學員班別
 * Body: { userId, className }
 */

import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

function authCheck(request) {
  const key = request.headers.get('x-admin-key') || request.headers.get('x-staff-key');
  return key === process.env.ADMIN_API_KEY || key === process.env.STAFF_API_KEY;
}

export async function POST(request) {
  if (!authCheck(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { userId, className } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const { error } = await sb
    .from('users')
    .update({ class_name: className || null, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
