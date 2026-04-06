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

  const { userId, className, role } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (className !== undefined) updates.class_name = className || null;
  if (role !== undefined) {
    const validRoles = ['student', 'staff', 'nutritionist'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
    }
    updates.role = role;
  }

  const { error } = await sb
    .from('users')
    .update(updates)
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
