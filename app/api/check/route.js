/**
 * 自我觀察 API（從 abc-line-bot 搬過來）
 *
 * POST /api/check — 儲存自評並回饋
 * GET  /api/check?userId=xxx — 取得最近紀錄（趨勢頁用）
 */

import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const FIELDS = ['post_meal_energy', 'hunger_between_meals', 'sweet_craving', 'daily_energy', 'body_feeling'];

const LABELS = {
  post_meal_energy: '餐後精神',
  hunger_between_meals: '兩餐間飢餓感',
  sweet_craving: '甜食渴望',
  daily_energy: '整天精力',
  body_feeling: '身體感覺',
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, checkDate } = body;

    if (!userId || !checkDate) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
    }

    for (const f of FIELDS) {
      const v = body[f];
      if (!v || v < 1 || v > 5) {
        return NextResponse.json({ error: `${f} 必須是 1-5` }, { status: 400 });
      }
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: 'DB 連線失敗' }, { status: 500 });

    const record = {
      user_id: userId,
      check_date: checkDate,
      post_meal_energy: body.post_meal_energy,
      hunger_between_meals: body.hunger_between_meals,
      sweet_craving: body.sweet_craving,
      daily_energy: body.daily_energy,
      body_feeling: body.body_feeling,
    };

    const { data, error } = await sb
      .from('abc_self_checks')
      .upsert(record, { onConflict: 'user_id,check_date' })
      .select()
      .single();

    if (error) {
      console.error('[Check] Insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const totalScore = FIELDS.reduce((sum, f) => sum + body[f], 0);

    // 查上一次的紀錄做比較
    const { data: prevRecords } = await sb
      .from('abc_self_checks')
      .select('*')
      .eq('user_id', userId)
      .lt('check_date', checkDate)
      .order('check_date', { ascending: false })
      .limit(1);

    let comparison = null;
    if (prevRecords && prevRecords.length > 0) {
      const prev = prevRecords[0];
      const prevTotal = prev.total_score;
      const diff = totalScore - prevTotal;

      let maxChange = 0;
      let maxChangeField = '';
      for (const f of FIELDS) {
        const change = body[f] - prev[f];
        if (Math.abs(change) > Math.abs(maxChange)) {
          maxChange = change;
          maxChangeField = f;
        }
      }

      const daysDiff = Math.round((new Date(checkDate) - new Date(prev.check_date)) / 86400000);
      const daysText = daysDiff === 1 ? '昨天' : `${daysDiff} 天前`;

      if (diff > 0) {
        comparison = `跟${daysText}比，總分 +${diff}！`;
        if (maxChange > 0) {
          comparison += `「${LABELS[maxChangeField]}」進步最明顯（${prev[maxChangeField]}→${body[maxChangeField]}），你的身體正在回應你的努力。`;
        }
      } else if (diff < 0) {
        comparison = `跟${daysText}比，總分 ${diff}。`;
        if (maxChange < 0) {
          comparison += `「${LABELS[maxChangeField]}」下降了（${prev[maxChangeField]}→${body[maxChangeField]}），可能跟最近的飲食或作息有關，不用擔心，觀察幾天看趨勢。`;
        }
      } else {
        comparison = `跟${daysText}比分數一樣，狀態維持得很穩定！`;
      }
    } else {
      comparison = '這是你的第一筆自我觀察紀錄，之後每次填都會幫你比較變化趨勢！';
    }

    return NextResponse.json({
      ok: true,
      totalScore,
      comparison,
    });

  } catch (err) {
    console.error('[Check] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const limit = parseInt(searchParams.get('limit') || '30');

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB error' }, { status: 500 });

  const { data, error } = await sb
    .from('abc_self_checks')
    .select('*')
    .eq('user_id', userId)
    .order('check_date', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, checks: data });
}
