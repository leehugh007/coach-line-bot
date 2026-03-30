/**
 * 清除沒有班級的舊匯入資料
 * DELETE /api/admin/cleanup
 *
 * 回填食物測驗 Redis → Supabase
 * POST /api/admin/cleanup?action=sync-quiz
 */
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getSupabase } from '@/lib/supabase';

const PRELOAD_PREFIX = 'coach-preload:';
const PRELOAD_INDEX = 'coach-preload:__index';
const PRELOAD_REALNAME_PREFIX = 'coach-preload-name:';

function checkAuth(request) {
  const key = request.headers.get('x-admin-key');
  return key === process.env.ADMIN_API_KEY;
}

export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const r = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const allNames = await r.smembers(PRELOAD_INDEX);
  let deleted = 0;
  const deletedNames = [];

  for (const name of (allNames || [])) {
    const data = await r.get(`${PRELOAD_PREFIX}${name}`);
    if (!data) continue;
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;

    if (!parsed.className) {
      await r.del(`${PRELOAD_PREFIX}${name}`);
      await r.srem(PRELOAD_INDEX, name);
      if (parsed.realName) {
        const normalizedReal = parsed.realName.replace(/\s+/g, '').toLowerCase();
        await r.del(`${PRELOAD_REALNAME_PREFIX}${normalizedReal}`);
      }
      deleted++;
      deletedNames.push(parsed.lineName || name);
    }
  }

  return NextResponse.json({ ok: true, deleted, names: deletedNames });
}

/**
 * POST /api/admin/cleanup?action=sync-quiz
 * 一次性回填：從 Redis coach-quiz:{userId} Set → Supabase coach_quiz_collected
 */
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action !== 'sync-quiz') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const r = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase unavailable' }, { status: 500 });

  // 找所有有 users 表紀錄的學員
  const { data: allUsers } = await sb.from('users').select('id, display_name');
  if (!allUsers || allUsers.length === 0) {
    return NextResponse.json({ ok: true, message: 'No users found' });
  }

  const results = [];
  for (const user of allUsers) {
    try {
      const foods = await r.smembers(`coach-quiz:${user.id}`);
      if (!foods || foods.length === 0) continue;

      // 查 Supabase 已有的
      const { data: existing } = await sb
        .from('coach_quiz_collected')
        .select('food')
        .eq('user_id', user.id);
      const existingSet = new Set((existing || []).map(row => row.food));

      const toInsert = foods
        .filter(food => !existingSet.has(food))
        .map(food => ({ user_id: user.id, food }));

      if (toInsert.length > 0) {
        await sb.from('coach_quiz_collected').upsert(toInsert, { onConflict: 'user_id,food' });
        results.push({ name: user.display_name, userId: user.id.substring(0, 8), redis: foods.length, new: toInsert.length, existing: existingSet.size });
      }
    } catch (e) {
      results.push({ name: user.display_name, error: e.message });
    }
  }

  return NextResponse.json({ ok: true, synced: results.length, details: results });
}
