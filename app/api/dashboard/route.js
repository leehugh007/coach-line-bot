/**
 * 學員個人 Dashboard API
 * GET /api/dashboard?userId=xxx
 */

import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { FOOD_QUIZZES, QUIZ_LEVELS } from '@/lib/quiz-data';
import { KNOWLEDGE_QUIZZES, KNOWLEDGE_LEVELS } from '@/lib/knowledge-quiz-data';

function getLevel(levels, count) {
  let level = levels[0];
  for (const l of levels) {
    if (count >= l.min) level = l;
  }
  return `${level.title}`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: 'DB error' }, { status: 500 });

  try {
    // 並行查詢所有資料
    const [
      userRes,
      quizRes,
      knowledgeRes,
      selfCheckRes,
      goalsRes,
      milestonesRes,
      convoCountRes,
      activeDaysRes,
    ] = await Promise.all([
      sb.from('users').select('display_name, class_name, journey, join_date').eq('id', userId).single(),
      sb.from('coach_quiz_collected').select('food').eq('user_id', userId),
      sb.from('coach_knowledge_collected').select('question_index').eq('user_id', userId),
      sb.from('abc_self_checks').select('*').eq('user_id', userId).order('check_date', { ascending: false }).limit(7),
      sb.from('goals').select('goal_text, status, completed_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      sb.from('milestones').select('milestone, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
      sb.from('conversations').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      sb.rpc('count_active_days', { uid: userId }).catch(() => null),
    ]);

    // 互動天數（如果 rpc 不存在，用 fallback）
    let activeDays = 0;
    if (activeDaysRes?.data != null) {
      activeDays = activeDaysRes.data;
    } else {
      // fallback: 直接查 distinct dates
      const { data: dates } = await sb.from('conversations')
        .select('created_at')
        .eq('user_id', userId);
      if (dates) {
        const uniqueDays = new Set(dates.map(d => d.created_at?.substring(0, 10)));
        activeDays = uniqueDays.size;
      }
    }

    const quizCollected = quizRes.data?.length || 0;
    const knowledgeCollected = knowledgeRes.data?.length || 0;

    return NextResponse.json({
      ok: true,
      profile: {
        displayName: userRes.data?.display_name || '學員',
        className: userRes.data?.class_name || null,
        joinDate: userRes.data?.join_date,
      },
      quizProgress: {
        collected: quizCollected,
        total: FOOD_QUIZZES.length,
        level: getLevel(QUIZ_LEVELS, quizCollected),
      },
      knowledgeProgress: {
        collected: knowledgeCollected,
        total: KNOWLEDGE_QUIZZES.length,
        level: getLevel(KNOWLEDGE_LEVELS, knowledgeCollected),
      },
      selfChecks: selfCheckRes.data || [],
      goals: goalsRes.data || [],
      milestones: milestonesRes.data || [],
      stats: {
        activeDays,
        totalConversations: convoCountRes.count || 0,
      },
      journey: userRes.data?.journey || null,
    });

  } catch (err) {
    console.error('[Dashboard] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
