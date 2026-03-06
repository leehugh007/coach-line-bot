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
