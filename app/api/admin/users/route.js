/**
 * 列出所有用戶 — 用於確認 userId
 * GET /api/admin/users?key=xxx
 * GET /api/admin/users?key=xxx&enrich=1  ← 額外查 LINE Profile 取得真實名稱
 */

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const LINE_API_BASE = 'https://api.line.me/v2/bot';

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return redis;
}

async function fetchLineDisplayName(userId) {
  try {
    const res = await fetch(`${LINE_API_BASE}/profile/${userId}`, {
      headers: { 'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.displayName || null;
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/users — 批次修復缺少 display_name 的學員
 * 從 LINE API fetch 真實名稱，更新 Supabase + Redis
 */
export async function POST(request) {
  const key = request.headers.get('x-admin-key') || request.headers.get('x-staff-key');
  if (key !== process.env.ADMIN_API_KEY && key !== process.env.STAFF_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getSupabase } = await import('@/lib/supabase');
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

    // 取得所有 display_name 為空的用戶
    const { data: users } = await sb.from('users').select('id, display_name').or('display_name.is.null,display_name.eq.');
    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, message: 'No users need fixing', fixed: 0 });
    }

    let fixed = 0;
    const log = [];
    const r = getRedis();

    for (const user of users) {
      const name = await fetchLineDisplayName(user.id);
      if (name) {
        // 更新 Supabase
        await sb.from('users').update({ display_name: name }).eq('id', user.id);

        // 更新 Redis（如果有的話）
        const cached = await r.get(`coach-user:${user.id}`);
        if (cached) {
          const profile = typeof cached === 'string' ? JSON.parse(cached) : cached;
          profile.lineDisplayName = name;
          if (profile.info && !profile.info.name) profile.info.name = name;
          await r.set(`coach-user:${user.id}`, profile);
        }

        fixed++;
        log.push({ id: user.id.substring(0, 8), name });
      } else {
        log.push({ id: user.id.substring(0, 8), name: null, reason: 'LINE API failed (可能已封鎖)' });
      }
    }

    return NextResponse.json({ ok: true, total: users.length, fixed, log });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/users — 重新比對：已加好友但未分班的學員 vs 預載名單
 * 用 LINE display_name 去預載名單裡找，比對到就自動分班
 */
export async function PUT(request) {
  const key = request.headers.get('x-admin-key') || request.headers.get('x-staff-key');
  if (key !== process.env.ADMIN_API_KEY && key !== process.env.STAFF_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getSupabase } = await import('@/lib/supabase');
    const { tryMatchPreloaded, tryMatchByRealName } = await import('@/lib/user');
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

    // 取得所有沒有 class_name 的學員（已加好友但未分班）
    const { data: users } = await sb.from('users')
      .select('id, display_name')
      .is('class_name', null)
      .not('display_name', 'is', null);

    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, message: 'No unmatched users found', matched: 0 });
    }

    let matched = 0;
    const log = [];

    for (const user of users) {
      const displayName = user.display_name;
      if (!displayName) continue;

      // 先用 LINE 名稱比對（不限班級）
      let success = await tryMatchPreloaded(user.id, displayName);

      // 沒配到的話，也用 display_name 當 realName 試試
      if (!success) {
        success = await tryMatchByRealName(user.id, displayName);
      }

      if (success) {
        matched++;
        log.push({ id: user.id.substring(0, 8), name: displayName, status: 'matched' });
        console.log(`[Rematch] ${displayName} → matched!`);
      } else {
        log.push({ id: user.id.substring(0, 8), name: displayName, status: 'no_match' });
      }
    }

    return NextResponse.json({ ok: true, total: users.length, matched, log });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (key !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const enrich = url.searchParams.get('enrich') === '1';

  try {
    const r = getRedis();
    const allKeys = [];
    let cursor = 0;
    do {
      const [newCursor, keys] = await r.scan(cursor, { match: 'user:*', count: 100 });
      cursor = newCursor;
      allKeys.push(...keys);
    } while (cursor !== 0 && cursor !== '0');

    // 只取 profile keys（不含 :meals, :summary 等子 key）
    const profileKeys = allKeys.filter(k => {
      const parts = k.split(':');
      return parts.length === 2 && parts[1].startsWith('U');
    });

    const users = [];
    for (const pk of profileKeys) {
      const data = await r.get(pk);
      const userId = data?.userId || pk.replace('user:', '');
      const entry = {
        key: pk,
        userId,
        displayName: data?.displayName || data?.lineDisplayName || data?.info?.name || null,
        createdAt: data?.createdAt || null,
        totalInteractions: data?.stats?.totalInteractions || 0,
      };

      // enrich 模式：呼叫 LINE Profile API 取得真實名稱
      if (enrich && !entry.displayName) {
        entry.lineProfileName = await fetchLineDisplayName(userId);
      }

      users.push(entry);
    }

    return NextResponse.json({
      totalKeys: allKeys.length,
      users,
      env_COACH_USER_ID: process.env.COACH_USER_ID || '(not set)',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
