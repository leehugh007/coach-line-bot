/**
 * 每週精選好問題 API（P2 群體感設計，2026-07-06）
 *
 * POST { question, answer, studentName? } → 匿名化後加入精選佇列
 * GET → 查看目前佇列
 *
 * 佇列：Redis LIST coach-featured:queue（LPUSH 進、cron RPOP 出 = FIFO）
 * 消費者：/api/cron/smart-push?type=featured（每週三 12:00 台灣）
 */

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const QUEUE_KEY = 'coach-featured:queue';

function checkAuth(request) {
  const key = request.headers.get('x-admin-key');
  return key === process.env.ADMIN_API_KEY;
}

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { question, answer, studentName } = await request.json();
    if (!question?.trim() || !answer?.trim()) {
      return NextResponse.json({ error: '缺 question 或 answer' }, { status: 400 });
    }

    // 匿名化：剝草稿開頭的 @名字 + 內文出現的學員名字全部換成「同學」
    let q = [...question.trim()].slice(0, 300).join('');
    let a = answer.trim();
    if (studentName) {
      const esc = studentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      a = a.replace(new RegExp(`^@${esc}[ \\t，,:：]*`), '');
      const nameRe = new RegExp(`@?${esc}`, 'g');
      q = q.replace(nameRe, '同學');
      a = a.replace(nameRe, '同學');
    }
    a = a.replace(/^@\S+[ \t]*/, ''); // 兜底：不管名字比對有沒有中，開頭 @token 一律剝掉

    const r = getRedis();
    await r.lpush(QUEUE_KEY, JSON.stringify({ question: q, answer: a, ts: Date.now() }));
    const queued = await r.llen(QUEUE_KEY);

    return NextResponse.json({ ok: true, queued });
  } catch (err) {
    console.error('[Feature API] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const r = getRedis();
    const items = (await r.lrange(QUEUE_KEY, 0, 19)) || [];
    const parsed = items.map(i => (typeof i === 'string' ? JSON.parse(i) : i));
    return NextResponse.json({ ok: true, count: parsed.length, items: parsed });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
