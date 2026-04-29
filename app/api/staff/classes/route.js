/**
 * 班級管理 API
 * GET  — 列出所有班級
 * POST — 新增/更新班級（name, startDate, endDate, weeks, pauseStart, pauseEnd）
 * DELETE — 刪除班級（?name=xxx，soft delete）
 *
 * 對應契約_系統規則.md §3 + §4 — 走 lib/classes.js 統一 Redis + Supabase 雙寫
 */

import { NextResponse } from 'next/server';
import { listAllClasses, saveClass, deleteClass } from '@/lib/classes';

function checkAuth(request) {
  const key = request.headers.get('x-staff-key') || request.headers.get('x-admin-key');
  return key === process.env.STAFF_API_KEY || key === process.env.ADMIN_API_KEY;
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const classes = await listAllClasses();

  // 為每個班級計算當前週數 + 狀態（保留既有 GET 回應 shape）
  const now = new Date();
  const enriched = classes.map(c => {
    const start = new Date(c.startDate);
    let diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));

    // 扣除停課區間
    let pauseDays = 0;
    let isPaused = false;
    if (c.pauseStart && c.pauseEnd) {
      const ps = new Date(c.pauseStart);
      const pe = new Date(c.pauseEnd);
      isPaused = now >= ps && now <= pe;
      if (now > pe) {
        pauseDays = Math.floor((pe - ps) / (1000 * 60 * 60 * 24)) + 1;
      } else if (now >= ps) {
        pauseDays = Math.floor((now - ps) / (1000 * 60 * 60 * 24));
      }
    }

    const effectiveDays = Math.max(0, diffDays - pauseDays);
    const currentWeek = diffDays >= 0 ? Math.floor(effectiveDays / 7) + 1 : 0;
    const isActive = diffDays >= 0 && !isPaused && (!c.endDate || now <= new Date(c.endDate));

    return {
      ...c,
      currentWeek,
      isActive,
      isPaused,
    };
  });

  // 按開學日期排序（最新的在前）
  enriched.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  return NextResponse.json({ classes: enriched });
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

  try {
    const saved = await saveClass(name, {
      startDate,
      endDate: endDate || null,
      weeks: weeks || 12,
      pauseStart: pauseStart || null,
      pauseEnd: pauseEnd || null,
    });
    return NextResponse.json({ ok: true, name, ...saved });
  } catch (err) {
    console.error('[StaffClasses] POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
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

  await deleteClass(name);
  return NextResponse.json({ ok: true, deleted: name });
}
