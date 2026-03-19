/**
 * 學員狀態總覽 API
 * GET — 列出所有學員，含互動狀態
 * Query: ?class=xxx（篩選班級）
 */

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getSupabase } from '@/lib/supabase';

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

const CLASS_PREFIX = 'coach-class:';

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const classFilter = url.searchParams.get('class');

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  // 1. 取得所有有 class_name 的用戶
  let query = sb.from('users').select('id, display_name, class_name, journey, updated_at, join_date');
  if (classFilter) {
    query = query.eq('class_name', classFilter);
  } else {
    query = query.not('class_name', 'is', null);
  }

  const { data: users, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 2. 取得班級的開學日期
  const r = getRedis();
  const classNames = [...new Set((users || []).map(u => u.class_name).filter(Boolean))];
  const classMap = {};
  for (const cn of classNames) {
    const classData = await r.get(`${CLASS_PREFIX}${cn}`);
    if (classData) {
      classMap[cn] = typeof classData === 'string' ? JSON.parse(classData) : classData;
    }
  }

  // 3. 取得每位用戶的最後互動時間和互動次數
  const studentList = [];
  for (const user of (users || [])) {
    // 從 Supabase 取最後對話和計數
    const [lastConv, convCount] = await Promise.all([
      sb.from('conversations').select('created_at').eq('user_id', user.id).eq('role', 'user').order('created_at', { ascending: false }).limit(1),
      sb.from('conversations').select('created_at', { count: 'exact', head: true }).eq('user_id', user.id).eq('role', 'user'),
    ]);

    const lastInteraction = lastConv.data?.[0]?.created_at || null;
    const totalInteractions = convCount.count || 0;

    // 計算週數
    let currentWeek = null;
    const classInfo = classMap[user.class_name];
    if (classInfo?.startDate) {
      const now = new Date();
      const start = new Date(classInfo.startDate);
      const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
      currentWeek = diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : 0;
    }

    // 判斷狀態
    let status = 'unknown';
    if (!lastInteraction) {
      status = 'never'; // 從沒互動過
    } else {
      const daysSince = Math.floor((Date.now() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince <= 7) status = 'active';
      else if (daysSince <= 14) status = 'watch';
      else status = 'care';
    }

    studentList.push({
      userId: user.id,
      name: user.display_name || '未知',
      className: user.class_name,
      currentWeek,
      lastInteraction,
      totalInteractions,
      status,
      joinDate: user.join_date,
    });
  }

  // 按狀態排序：需要關心 > 待關注 > 活躍
  const statusOrder = { care: 0, watch: 1, never: 2, active: 3, unknown: 4 };
  studentList.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

  return NextResponse.json({
    students: studentList,
    total: studentList.length,
    classes: classMap,
  });
}
