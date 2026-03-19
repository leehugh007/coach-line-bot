/**
 * 班級管理 API
 * GET  — 列出所有班級
 * POST — 新增/更新班級（name, startDate, endDate）
 * DELETE — 刪除班級（?name=xxx）
 */

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const CLASS_PREFIX = 'coach-class:';
const CLASS_INDEX = 'coach-classes-index';

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

function checkAuth(request) {
  const key = request.headers.get('x-staff-key') || request.headers.get('x-admin-key');
  return key === process.env.STAFF_API_KEY || key === process.env.ADMIN_API_KEY;
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const r = getRedis();
  const names = await r.smembers(CLASS_INDEX);
  if (!names || names.length === 0) return NextResponse.json({ classes: [] });

  const classes = [];
  for (const name of names) {
    const data = await r.get(`${CLASS_PREFIX}${name}`);
    if (data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      // 計算目前週數（扣掉停課天數）
      const now = new Date();
      const start = new Date(parsed.startDate);
      let diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));

      // 扣除停課區間
      let pauseDays = 0;
      let isPaused = false;
      if (parsed.pauseStart && parsed.pauseEnd) {
        const ps = new Date(parsed.pauseStart);
        const pe = new Date(parsed.pauseEnd);
        isPaused = now >= ps && now <= pe;
        if (now > pe) {
          pauseDays = Math.floor((pe - ps) / (1000 * 60 * 60 * 24)) + 1;
        } else if (now >= ps) {
          pauseDays = Math.floor((now - ps) / (1000 * 60 * 60 * 24));
        }
      }

      const effectiveDays = Math.max(0, diffDays - pauseDays);
      const currentWeek = diffDays >= 0 ? Math.floor(effectiveDays / 7) + 1 : 0;
      const isActive = diffDays >= 0 && !isPaused && (!parsed.endDate || now <= new Date(parsed.endDate));

      classes.push({
        ...parsed,
        name,
        currentWeek,
        isActive,
        isPaused,
      });
    }
  }

  // 按開學日期排序（最新的在前）
  classes.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  return NextResponse.json({ classes });
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, startDate, endDate, weeks, pauseStart, pauseEnd } = body;

  if (!name || !startDate) {
    return NextResponse.json({ error: 'name and startDate required' }, { status: 400 });
  }

  const r = getRedis();
  const classData = {
    startDate,
    endDate: endDate || null,
    weeks: weeks || 8,
    pauseStart: pauseStart || null,  // 停課開始（例如過年）
    pauseEnd: pauseEnd || null,      // 停課結束
    createdAt: new Date().toISOString(),
  };

  await r.set(`${CLASS_PREFIX}${name}`, JSON.stringify(classData));
  await r.sadd(CLASS_INDEX, name);

  return NextResponse.json({ ok: true, name, ...classData });
}

export async function DELETE(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'name parameter required' }, { status: 400 });
  }

  const r = getRedis();
  await r.del(`${CLASS_PREFIX}${name}`);
  await r.srem(CLASS_INDEX, name);

  return NextResponse.json({ ok: true, deleted: name });
}
