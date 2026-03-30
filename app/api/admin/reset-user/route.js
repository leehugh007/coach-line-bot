/**
 * 重置單一用戶的所有資料（Redis + Supabase）
 * DELETE /api/admin/reset-user?userId=xxx
 * 需要 x-admin-key header
 */

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getSupabase } from '@/lib/supabase';

function checkAuth(request) {
  const key = request.headers.get('x-admin-key');
  return key === process.env.ADMIN_API_KEY;
}

export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const results = { redis: [], supabase: [] };

  // === Redis 清除 ===
  try {
    const r = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    const redisKeys = [
      `coach-chat:${userId}`,
      `coach-user:${userId}`,
      `coach:${userId}:topics`,
      `coach:${userId}:milestones`,
      `coach:${userId}:summary`,
      `coach:${userId}:journey`,
      `coach-goal:${userId}`,
      `coach-push-log:${userId}`,
      `coach-week-push:${userId}`,
      `coach-portrait:${userId}`,
      `coach-portrait-ver:${userId}`,
      `coach-quiz:${userId}`,
      `coach-pending-class:${userId}`,
      `coach-pending-verify:${userId}`,
    ];

    for (const key of redisKeys) {
      const deleted = await r.del(key);
      if (deleted) results.redis.push(key);
    }
  } catch (err) {
    results.redisError = err.message;
  }

  // === Supabase 清除 ===
  try {
    const sb = getSupabase();
    if (sb) {
      const tables = [
        'conversations',
        'coaching_tags',
        'milestones',
        'goals',
        'coach_quiz_collected',
        'coach_quiz_sessions',
        'coach_knowledge_collected',
        'coach_knowledge_sessions',
      ];

      for (const table of tables) {
        const { count } = await sb.from(table).delete({ count: 'exact' }).eq('user_id', userId);
        results.supabase.push({ table, deleted: count || 0 });
      }

      // abc_self_checks 也清
      const { count: selfCheckCount } = await sb.from('abc_self_checks').delete({ count: 'exact' }).eq('user_id', userId);
      results.supabase.push({ table: 'abc_self_checks', deleted: selfCheckCount || 0 });

      // users 表最後清（主表）
      const { count: userCount } = await sb.from('users').delete({ count: 'exact' }).eq('id', userId);
      results.supabase.push({ table: 'users', deleted: userCount || 0 });
    }
  } catch (err) {
    results.supabaseError = err.message;
  }

  return NextResponse.json({ ok: true, userId, results });
}
