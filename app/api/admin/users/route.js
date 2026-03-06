/**
 * 列出所有用戶 — 用於確認 userId
 * GET /api/admin/users?key=xxx
 */

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

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

export async function GET(request) {
  const key = new URL(request.url).searchParams.get('key');
  if (key !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
      users.push({
        key: pk,
        userId: data?.userId || pk.replace('user:', ''),
        displayName: data?.displayName || null,
        createdAt: data?.createdAt || null,
        totalInteractions: data?.stats?.totalInteractions || 0,
      });
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
