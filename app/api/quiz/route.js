/**
 * Quiz API — 食物分類大挑戰
 *
 * GET  ?userId=xxx  → 取得用戶收集記錄與最近場次
 * POST             → 儲存測驗結果 + 推播 LINE 訊息
 */

import { getSupabase } from '@/lib/supabase';
import { pushMessage } from '@/lib/line';
import { FOOD_QUIZZES, QUIZ_LEVELS } from '@/lib/quiz-data';

const LEVELS = QUIZ_LEVELS.map(l => ({ min: l.min, title: l.title, emoji: l.emoji }));

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

    // Fetch collected foods and recent sessions in parallel
    const [collectedRes, sessionsRes] = await Promise.all([
      sb.from('coach_quiz_collected')
        .select('food')
        .eq('user_id', userId),
      sb.from('coach_quiz_sessions')
        .select('score, total, duration_seconds, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const collected = (collectedRes.data || []).map(r => r.food);
    const recentSessions = (sessionsRes.data || []).map(s => ({
      score: s.score,
      total: s.total,
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
    console.error('[Quiz GET] error:', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, score, total, correctFoods, wrongFoods, durationSeconds } = body;

    if (!userId || score === undefined || !total) {
      return Response.json({ error: 'missing fields' }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) {
      return Response.json({ ok: false, error: 'supabase unavailable' }, { status: 500 });
    }

    // 1. Save quiz session
    await sb.from('coach_quiz_sessions').insert({
      user_id: userId,
      score,
      total,
      correct_foods: correctFoods || [],
      wrong_foods: wrongFoods || [],
      duration_seconds: durationSeconds || null,
    });

    // 2. Upsert correct foods into collected table
    const newCollected = [];
    if (correctFoods && correctFoods.length > 0) {
      // Get existing collected foods
      const { data: existing } = await sb
        .from('coach_quiz_collected')
        .select('food')
        .eq('user_id', userId);
      const existingFoods = new Set((existing || []).map(r => r.food));

      const toInsert = correctFoods
        .filter(food => !existingFoods.has(food))
        .map(food => ({ user_id: userId, food }));

      if (toInsert.length > 0) {
        await sb.from('coach_quiz_collected').upsert(toInsert, {
          onConflict: 'user_id,food',
        });
        newCollected.push(...toInsert.map(r => r.food));
      }
    }

    // 3. Get total collected count
    const { data: allCollected } = await sb
      .from('coach_quiz_collected')
      .select('food')
      .eq('user_id', userId);
    const totalCollected = (allCollected || []).length;
    const level = getLevel(totalCollected);

    // 4. Get last session for comparison
    let comparison = null;
    const { data: lastSessions } = await sb
      .from('coach_quiz_sessions')
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

    // 5. Also sync to Redis (keep the existing Redis-based system in sync)
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      // Add all correct foods to the Redis set used by the existing quiz system
      for (const food of correctFoods || []) {
        await redis.sadd(`coach-quiz:${userId}`, food);
      }
    } catch (redisErr) {
      console.warn('[Quiz POST] Redis sync failed (non-critical):', redisErr.message);
    }

    // 6. Push LINE message with result
    try {
      const mins = durationSeconds ? Math.floor(durationSeconds / 60) : 0;
      const secs = durationSeconds ? durationSeconds % 60 : 0;
      const timeStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;

      let msg = `🍽️ 食物分類大挑戰結果\n\n`;
      msg += `分數：${score} / ${total}\n`;
      msg += `用時：${timeStr}\n`;
      msg += `收集進度：${totalCollected} / ${FOOD_QUIZZES.length}（${level.emoji} ${level.title}）\n`;
      if (newCollected.length > 0) {
        msg += `\n🆕 新收集：${newCollected.join('、')}\n`;
      }
      if (comparison) {
        msg += `\n${comparison}`;
      }

      await pushMessage(userId, msg);
    } catch (pushErr) {
      console.warn('[Quiz POST] Push message failed (non-critical):', pushErr.message);
    }

    return Response.json({
      ok: true,
      totalCollected,
      newCollected,
      comparison,
      level,
    });
  } catch (err) {
    console.error('[Quiz POST] error:', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}
