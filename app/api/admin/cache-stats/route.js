/**
 * Context Caching 成本對比 API
 *
 * GET /api/admin/cache-stats
 * 對比 cache 上線前後的 private_reply 成本
 *
 * 分界點：2026-04-04T16:00:00+08:00（cache 上線時間）
 */

import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

function checkAuth(request) {
  const key = request.headers.get('x-admin-key');
  return key === process.env.ADMIN_API_KEY;
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'No Supabase' }, { status: 500 });
  }

  // cache 上線時間（UTC）：2026-04-04 08:00 = 台灣 16:00
  const cacheGoLive = '2026-04-04T08:00:00Z';

  // 拉 before（上線前 7 天）和 after（上線後到現在）
  const { data, error } = await supabase.rpc('exec_sql', { sql: '' }).catch(() => ({ data: null, error: 'rpc not available' }));

  // 直接用 Supabase query
  const [beforeResult, afterResult, dailyResult] = await Promise.all([
    // Before: cache 上線前 7 天
    supabase
      .from('abc_api_usage')
      .select('input_tokens, output_tokens, cost_twd')
      .eq('bot', 'coach')
      .eq('call_type', 'private_reply')
      .lt('created_at', cacheGoLive)
      .gte('created_at', '2026-03-28T08:00:00Z'),

    // After: cache 上線後
    supabase
      .from('abc_api_usage')
      .select('input_tokens, output_tokens, cost_twd')
      .eq('bot', 'coach')
      .eq('call_type', 'private_reply')
      .gte('created_at', cacheGoLive),

    // Daily breakdown（最近 14 天，按日分組）
    supabase
      .from('abc_api_usage')
      .select('created_at, input_tokens, output_tokens, cost_twd')
      .eq('bot', 'coach')
      .eq('call_type', 'private_reply')
      .gte('created_at', '2026-03-21T00:00:00Z')
      .order('created_at', { ascending: true }),
  ]);

  const calcStats = (rows) => {
    if (!rows || rows.length === 0) return null;
    const calls = rows.length;
    const totalCost = rows.reduce((s, r) => s + (r.cost_twd || 0), 0);
    const avgInput = Math.round(rows.reduce((s, r) => s + (r.input_tokens || 0), 0) / calls);
    const avgOutput = Math.round(rows.reduce((s, r) => s + (r.output_tokens || 0), 0) / calls);
    return {
      calls,
      avg_input_tokens: avgInput,
      avg_output_tokens: avgOutput,
      total_cost_twd: Math.round(totalCost * 100) / 100,
      avg_cost_per_call: Math.round((totalCost / calls) * 10000) / 10000,
    };
  };

  // 按日分組
  const dailyMap = {};
  if (dailyResult.data) {
    for (const row of dailyResult.data) {
      const day = row.created_at.substring(0, 10); // UTC date
      if (!dailyMap[day]) dailyMap[day] = [];
      dailyMap[day].push(row);
    }
  }
  const daily = Object.entries(dailyMap)
    .map(([date, rows]) => ({ date, ...calcStats(rows) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const before = calcStats(beforeResult.data);
  const after = calcStats(afterResult.data);

  // 計算省了多少
  let savings = null;
  if (before && after && after.calls > 0) {
    const costReduction = Math.round((1 - after.avg_cost_per_call / before.avg_cost_per_call) * 100);
    const inputReduction = Math.round((1 - after.avg_input_tokens / before.avg_input_tokens) * 100);
    savings = {
      cost_reduction_pct: costReduction,
      input_reduction_pct: inputReduction,
      projected_weekly_cost: Math.round(after.avg_cost_per_call * (before.calls / 1) * 100) / 100,
    };
  }

  return NextResponse.json({
    cache_go_live: '2026-04-04 16:00 (台灣時間)',
    before,
    after: after || { calls: 0, note: 'cache 剛上線，還沒有數據' },
    savings,
    daily,
  });
}
