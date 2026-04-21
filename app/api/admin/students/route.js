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
import { Redis } from '@upstash/redis';

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

  // className — T7 觸發源 B（契約 §5，2026-04-20 修訂）
  // 1) 先 SELECT 舊 class_name 比對
  // 2) 若新舊不同 → 同步清全部 4 個 renewal 欄位（含 confirmed_at）
  //    理由：renewal_confirmed_at 是「本班期已完成續報」狀態，換班 = 新一輪
  //    新班級的 w10/w11/w12 應照常推（問續報下一期）
  // 3) update Supabase 成功後同步 Redis profile（避免 camelCase 殘留致 classStatus 誤判）
  let classChanged = false;
  let newClassForRedis = null;
  if (className !== undefined) {
    const newClass = className || null;
    updates.class_name = newClass;
    newClassForRedis = newClass;

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
        updates.renewal_confirmed_at = null;
        classChanged = true;
        console.log(`[Admin T7] ${userId?.substring(0, 8)} class_name changed ${oldClass} → ${newClass}, reset all renewal fields`);
      }
    } catch (err) {
      console.error('[Admin T7] SELECT old class_name error:', err.message);
      // 查舊值失敗不阻斷，繼續 update
    }
  }

  const { error } = await sb
    .from('users')
    .update(updates)
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Redis profile 同步（T7 觸發源 B 的 Redis 層 — pattern 同 batchImportIntros auto-reassign）
  // 不阻斷回應；Supabase 已寫入成功是主狀態，Redis 失敗可由 backfill-class-sync 修
  if (classChanged) {
    try {
      const r = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      const redisKey = `coach-user:${userId}`;
      const cached = await r.get(redisKey);
      if (cached && typeof cached === 'object') {
        cached.className = newClassForRedis;
        delete cached.class_name; // 清舊 snake_case 殘留
        cached.renewalIntent = null;
        cached.renewalIntentAt = null;
        cached.renewalIntentSource = null;
        cached.renewalConfirmedAt = null;
        await r.set(redisKey, cached);
      }
      // 清 Portrait cache + 續報通知 cooldown + 推播紀錄（新班期重新開始）
      await r.del(`coach-portrait:${userId}`);
      await r.del(`coach-portrait-ver:${userId}`);
      await r.del(`coach-renewal-notify-cd:${userId}`);
      await r.del(`coach-renewal-push:${userId}:w10`);
      await r.del(`coach-renewal-push:${userId}:w11`);
      await r.del(`coach-renewal-push:${userId}:w12`);
      console.log(`[Admin T7 Redis] ${userId?.substring(0, 8)} Redis profile synced`);
    } catch (err) {
      console.error('[Admin T7 Redis] sync error:', err.message);
    }
  }

  return NextResponse.json({ ok: true });
}
