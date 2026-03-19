/**
 * 清除沒有班級的舊匯入資料
 * DELETE /api/admin/cleanup
 */
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

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
