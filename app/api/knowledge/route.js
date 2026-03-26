/**
 * Knowledge Quiz API — 瘦身知識大挑戰
 *
 * GET  ?userId=xxx  → 取得用戶收集記錄與最近場次
 * POST             → 儲存測驗結果 + 推播 LINE 訊息
 */

import { getSupabase } from '@/lib/supabase';
import { pushMessage } from '@/lib/line';
import { KNOWLEDGE_QUIZZES, KNOWLEDGE_LEVELS } from '@/lib/knowledge-quiz-data';

const LEVELS = KNOWLEDGE_LEVELS.map(l => ({ min: l.min, title: l.title, emoji: l.emoji }));

function getLevel(count) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (count >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return Response.json({ error: 'missing userId' }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) {
      return Response.json({ collected: [], totalCollected: 0, recentSessions: [], level: LEVELS[0] });
    }

    const [collectedRes, sessionsRes] = await Promise.all([
      sb.from('coach_knowledge_collected')
        .select('question_index')
        .eq('user_id', userId),
      sb.from('coach_knowledge_sessions')
        .select('score, total, tier, duration_seconds, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const collected = (collectedRes.data || []).map(r => r.question_index);
    const recentSessions = (sessionsRes.data || []).map(s => ({
      score: s.score,
      total: s.total,
      tier: s.tier,
      duration: s.duration_seconds,
      date: s.created_at,
    }));

    const level = getLevel(collected.length);

    return Response.json({
      collected,
      totalCollected: collected.length,
      recentSessions,
      level,
    });
  } catch (err) {
    console.error('[Knowledge GET] error:', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, score, total, tier, correctIndices, wrongIndices, durationSeconds } = body;

    if (!userId || score === undefined || !total) {
      return Response.json({ error: 'missing fields' }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) {
      return Response.json({ ok: false, error: 'supabase unavailable' }, { status: 500 });
    }

    // 1. Save session
    await sb.from('coach_knowledge_sessions').insert({
      user_id: userId,
      score,
      total,
      tier: tier || 0,
      correct_indices: correctIndices || [],
      wrong_indices: wrongIndices || [],
      duration_seconds: durationSeconds || null,
    });

    // 2. Upsert correct indices into collected table
    const newCollected = [];
    if (correctIndices && correctIndices.length > 0) {
      const { data: existing } = await sb
        .from('coach_knowledge_collected')
        .select('question_index')
        .eq('user_id', userId);
      const existingSet = new Set((existing || []).map(r => r.question_index));

      const toInsert = correctIndices
        .filter(idx => !existingSet.has(idx))
        .map(idx => ({ user_id: userId, question_index: idx }));

      if (toInsert.length > 0) {
        await sb.from('coach_knowledge_collected').upsert(toInsert, {
          onConflict: 'user_id,question_index',
        });
        newCollected.push(...toInsert.map(r => r.question_index));
      }
    }

    // 3. Get total collected count
    const { data: allCollected } = await sb
      .from('coach_knowledge_collected')
      .select('question_index')
      .eq('user_id', userId);
    const totalCollected = (allCollected || []).length;
    const level = getLevel(totalCollected);

    // 4. Comparison with last session
    let comparison = null;
    const { data: lastSessions } = await sb
      .from('coach_knowledge_sessions')
      .select('score')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(2);

    if (lastSessions && lastSessions.length >= 2) {
      const lastScore = lastSessions[1].score;
      if (score > lastScore) {
        comparison = `比上次進步了！上次 ${lastScore} 分，這次 ${score} 分 📈`;
      } else if (score === lastScore) {
        comparison = `跟上次一樣 ${score} 分，穩穩的 💪`;
      } else {
        comparison = `上次 ${lastScore} 分，這次 ${score} 分，下次再挑戰 😊`;
      }
    }

    // 5. Push LINE message
    try {
      const mins = durationSeconds ? Math.floor(durationSeconds / 60) : 0;
      const secs = durationSeconds ? durationSeconds % 60 : 0;
      const timeStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
      const tierLabel = tier === 0 ? '全部混合' : tier === 1 ? '基礎篇' : tier === 2 ? '進階篇' : '高手篇';

      let msg = `🧠 瘦身知識大挑戰結果\n\n`;
      msg += `難度：${tierLabel}\n`;
      msg += `分數：${score} / ${total}\n`;
      msg += `用時：${timeStr}\n`;
      msg += `知識進度：${totalCollected} / ${KNOWLEDGE_QUIZZES.length}（${level.emoji} ${level.title}）\n`;
      if (newCollected.length > 0) {
        const names = newCollected.map(idx => {
          const q = KNOWLEDGE_QUIZZES[idx];
          return q ? q.statement.substring(0, 15) + (q.statement.length > 15 ? '...' : '') : '';
        }).filter(Boolean);
        msg += `\n🆕 新掌握 ${newCollected.length} 個知識點\n`;
      }
      if (comparison) {
        msg += `\n${comparison}`;
      }

      await pushMessage(userId, msg);
    } catch (pushErr) {
      console.warn('[Knowledge POST] Push message failed (non-critical):', pushErr.message);
    }

    return Response.json({
      ok: true,
      totalCollected,
      newCollected,
      comparison,
      level,
    });
  } catch (err) {
    console.error('[Knowledge POST] error:', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
