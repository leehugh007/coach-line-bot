/**
 * 學員歷史資料 API（從 Supabase 讀取）
 *
 * GET /api/admin/history          → 學員列表
 * GET /api/admin/history?user=xxx → 該學員的對話紀錄 + 標籤
 */

import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

function authCheck(request) {
  const key = request.headers.get('x-admin-key');
  return key === process.env.ADMIN_API_KEY;
}

export async function GET(request) {
  if (!authCheck(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get('user');

  // 單一學員的對話紀錄
  if (userId) {
    const [convRes, tagRes, userRes] = await Promise.all([
      sb.from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(200),
      sb.from('coaching_tags')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      sb.from('users')
        .select('*')
        .eq('id', userId)
        .single(),
    ]);

    // 解析 coaching_tags：tag 欄位是 "topic:emotion:progress:style" 冒號字串
    const parsedTags = (tagRes.data || []).map(row => {
      const parts = (row.tag || '').split(':');
      return {
        topic: parts[0] || '?',
        emotion: parts[1] || '?',
        progress_signal: parts[2] || 'neutral',
        conversation_style: parts[3] || 'asking',
        core_issue: row.core_issue || null,
        date: row.created_at,
      };
    });

    return NextResponse.json({
      ok: true,
      user: userRes.data || null,
      conversations: convRes.data || [],
      tags: parsedTags,
    });
  }

  // 學員列表（含對話數量統計）
  const { data: users, error } = await sb
    .from('users')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 取得每個學員的對話數
  const enriched = [];
  for (const u of (users || [])) {
    const { count } = await sb
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', u.id);

    enriched.push({
      ...u,
      conversation_count: count || 0,
    });
  }

  return NextResponse.json({ ok: true, users: enriched });
}
