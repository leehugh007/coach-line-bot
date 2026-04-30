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
import { performClassChange } from '@/lib/user';

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

  // 1) className 變更走 performClassChange 統一入口（契約 §4 + 雷池洞 36 根治解）
  //    包含：Supabase users.class_name + 4 renewal 欄 + Redis profile + 6 cache keys
  if (className !== undefined) {
    const result = await performClassChange(userId, className || null, { source: 'admin' });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    if (result.changed) {
      console.log(`[Admin T7] ${userId?.substring(0, 8)} class_name changed ${result.oldClass} → ${result.newClass}, reset all renewal fields`);
    }
  }

  // 2) role / confirmRenewal — 跟 className 獨立（兩個欄位都不用清 renewal 全部）
  //    confirmRenewal: T4/T5（契約 §5），一律 plain UPDATE 寫 timestamp（禁用 jsonb_set，2026-04-14 Awear 事故教訓）
  const updates = { updated_at: new Date().toISOString() };
  let hasFieldUpdate = false;

  if (role !== undefined) {
    const validRoles = ['student', 'staff', 'nutritionist'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 400 });
    }
    updates.role = role;
    hasFieldUpdate = true;
  }

  if (confirmRenewal !== undefined) {
    updates.renewal_confirmed_at = confirmRenewal ? new Date().toISOString() : null;
    hasFieldUpdate = true;
  }

  if (hasFieldUpdate) {
    const { error } = await sb.from('users').update(updates).eq('id', userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
