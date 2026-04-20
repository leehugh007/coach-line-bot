/**
 * 學員管理 API
 *
 * POST /api/admin/students
 * Body: {
 *   userId,                                      // 必要
 *   className?,                                  // 更新班別（null / '' 代表清空）
 *   role?: 'student'|'staff'|'nutritionist',     // 更新角色
 *   confirmRenewal?: boolean,                    // true → set renewal_confirmed_at=now()；false → NULL
 * }
 *
 * 契約_續報記錄.md §5 T4/T5（confirm/unconfirm）+ §5 T7 觸發源 B（class_name 改變清 intent）
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

  const { userId, className, role, confirmRenewal } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const updates = { updated_at: new Date().toISOString() };

  // role
  if (role !== undefined) {
    const validRoles = ['student', 'staff', 'nutritionist'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
    }
    updates.role = role;
  }

  // confirmRenewal — T4/T5（契約 §5）
  // 一律用 plain UPDATE 寫 timestamp，禁用 jsonb_set（2026-04-14 Awear 事故教訓）
  if (confirmRenewal !== undefined) {
    updates.renewal_confirmed_at = confirmRenewal ? new Date().toISOString() : null;
  }

  // className — T7 觸發源 B（契約 §5）
  // 1) 先 SELECT 舊 class_name 比對
  // 2) 若新舊不同（包含 NULL 清空 = 退費）→ 同步清 renewal_intent / _at / _source（保留 confirmed_at）
  if (className !== undefined) {
    const newClass = className || null;
    updates.class_name = newClass;

    try {
      const { data: old } = await sb
        .from('users')
        .select('class_name')
        .eq('id', userId)
        .single();
      const oldClass = old?.class_name || null;
      if (oldClass !== newClass) {
        updates.renewal_intent = null;
        updates.renewal_intent_at = null;
        updates.renewal_intent_source = null;
        // renewal_confirmed_at 保留（業務紀錄不刪，契約 §5 T7 NULL 情境說明）
        console.log(`[Admin T7] ${userId?.substring(0, 8)} class_name changed ${oldClass} → ${newClass}, reset renewal_intent`);
      }
    } catch (err) {
      console.error('[Admin T7] SELECT old class_name error:', err.message);
      // 查舊值失敗不阻斷，繼續 update（保守，寧可不清 intent 也不中斷操作）
    }
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
