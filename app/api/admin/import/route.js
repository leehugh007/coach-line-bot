/**
 * Admin API — 批次匯入學員自我介紹
 *
 * POST /api/admin/import
 * Header: x-admin-key = ADMIN_API_KEY
 * Body: { students: [{ lineName, studentId?, className?, intro, note? }] }
 *
 * 將 Excel 整理好的資料預載入 Redis，
 * 等學員私訊 Bot 時，自動用 LINE 顯示名稱比對。
 */

import { batchImportIntros, getPreloadedStatus } from '@/lib/user';
import { NextResponse } from 'next/server';

const ADMIN_KEY = process.env.ADMIN_API_KEY;

function checkAuth(request) {
  if (!ADMIN_KEY) return false;
  const key = request.headers.get('x-admin-key');
  return key === ADMIN_KEY;
}

// POST: 批次匯入
export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { students } = await request.json();

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { error: 'students array is required and must not be empty' },
        { status: 400 }
      );
    }

    // 驗證每筆資料
    const valid = [];
    const errors = [];

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      if (!s.lineName || !s.intro) {
        errors.push({ index: i, reason: 'lineName and intro are required', data: s });
        continue;
      }
      if (s.intro.length < 10) {
        errors.push({ index: i, reason: 'intro too short (min 10 chars)', data: s });
        continue;
      }
      valid.push(s);
    }

    if (valid.length === 0) {
      return NextResponse.json(
        { error: 'No valid students to import', errors },
        { status: 400 }
      );
    }

    const result = await batchImportIntros(valid);

    return NextResponse.json({
      ok: true,
      imported: result.imported,
      skipped: result.skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `成功匯入 ${result.imported} 筆，跳過 ${result.skipped} 筆${errors.length > 0 ? `，${errors.length} 筆格式錯誤` : ''}`,
    });

  } catch (err) {
    console.error('[Admin] Import error:', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    );
  }
}

// GET: 查看預載入狀態
export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const status = await getPreloadedStatus();
    return NextResponse.json({
      ok: true,
      total: status.length,
      matched: status.filter(s => s.matched).length,
      unmatched: status.filter(s => !s.matched).length,
      students: status,
    });
  } catch (err) {
    console.error('[Admin] Status error:', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    );
  }
}
