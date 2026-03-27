/**
 * 學員個人 Dashboard API
 * GET /api/dashboard?userId=xxx
 */

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getSupabase } from '@/lib/supabase';
import { FOOD_QUIZZES, QUIZ_LEVELS } from '@/lib/quiz-data';
import { KNOWLEDGE_QUIZZES, KNOWLEDGE_LEVELS } from '@/lib/knowledge-quiz-data';

let redis;
function getRedis() {
  if (!redis) redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
  return redis;
}

function getLevel(levels, count) {
  let level = levels[0];
  for (const l of levels) {
    if (count >= l.min) level = l;
  }
  return `${level.title}`;
}

/**
 * 生成「小幫手眼中的你」— 人格觀察，不是事實記錄
 * 快取 7 天，只在 cache miss 時呼叫 Gemini
 */
async function getPortrait(userId, displayName, journey, progressRecords, emotionTrend) {
  const r = getRedis();
  const cacheKey = `coach-portrait:${userId}`;

  // 查快取
  const cached = await r.get(cacheKey);
  if (cached) return cached;

  // 沒有足夠資料就不生成
  if (!journey && (!progressRecords || progressRecords.length === 0)) return null;

  // 組合素材給 AI
  const progressText = (progressRecords || []).slice(0, 5).map(p => p.detail).join('、');
  const emotionText = (emotionTrend || []).slice(-10).map(e => e.emotion).join('→');

  const prompt = `你是「休校長小幫手」，一位溫暖的 AI 教練助手。
現在要幫學員寫一段「小幫手眼中的你」，這段文字會顯示在學員的個人頁面上。

學員名字：${displayName}

以下是你對這位學員的觀察素材：
${journey ? `旅程紀錄：${journey.substring(0, 500)}` : ''}
${progressText ? `進步紀錄：${progressText}` : ''}
${emotionText ? `情緒變化：${emotionText}` : ''}

規則：
1. 用「你」稱呼學員，像跟朋友說話
2. 重點寫「人格特質」：態度、用心、努力、面對問題的方式、成長的勇氣
3. 不要寫具體數字（體脂率、天數、公斤數等）— 那些已經在其他地方顯示了
4. 不要寫目標或飲食內容 — 只寫「你是什麼樣的人」
5. 要讓學員看完覺得「原來小幫手是這樣看我的」，產生被理解的感覺
6. 分 2-3 段，每段 1-2 句。總共 100-150 字
7. 語氣溫暖但不浮誇，像一休說話的方式
8. 最後一句帶一點鼓勵，但不要雞湯`;

  try {
    const key = process.env.GEMINI_API_KEY;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
        }),
      }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (text) {
      await r.set(cacheKey, text, { ex: 7 * 24 * 60 * 60 }); // 快取 7 天
      return text;
    }
  } catch (err) {
    console.error('[Portrait] Gemini error:', err.message);
  }

  return null;
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
      tagsRes,
      progressRes,
    ] = await Promise.all([
      sb.from('users').select('display_name, class_name, journey, join_date').eq('id', userId).single(),
      sb.from('coach_quiz_collected').select('food').eq('user_id', userId),
      sb.from('coach_knowledge_collected').select('question_index').eq('user_id', userId),
      sb.from('abc_self_checks').select('*').eq('user_id', userId).order('check_date', { ascending: false }).limit(7),
      sb.from('goals').select('goal_text, status, completed_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      sb.from('milestones').select('milestone, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
      sb.from('conversations').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      sb.from('conversations').select('created_at').eq('user_id', userId),
      // 情緒趨勢：最近 20 筆 coaching_tags
      sb.from('coaching_tags').select('tag, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      // 進步紀錄：有 progress_detail 的標籤
      sb.from('coaching_tags').select('progress_detail, created_at').eq('user_id', userId).not('progress_detail', 'is', null).order('created_at', { ascending: false }).limit(15),
    ]);

    // 互動天數：從對話紀錄算 distinct dates
    let activeDays = 0;
    const dates = activeDaysRes?.data;
    if (dates && dates.length > 0) {
      const uniqueDays = new Set(dates.map(d => d.created_at?.substring(0, 10)));
      activeDays = uniqueDays.size;
    }

    const quizCollected = quizRes.data?.length || 0;
    const knowledgeCollected = knowledgeRes.data?.length || 0;

    // 解析情緒趨勢（tag 格式 "topic:emotion:progress_signal:style"）
    const emotionTrend = (tagsRes.data || []).reverse().map(row => {
      const parts = (row.tag || '').split(':');
      return {
        emotion: parts[1] || 'neutral',
        progress: parts[2] || 'neutral',
        date: row.created_at,
      };
    });

    // 進步紀錄
    const progressRecords = (progressRes.data || []).map(row => ({
      detail: row.progress_detail,
      date: row.created_at,
    }));

    const displayName = userRes.data?.display_name || '學員';

    // 生成「小幫手眼中的你」（快取 7 天）
    const portrait = await getPortrait(userId, displayName, userRes.data?.journey, progressRecords, emotionTrend);

    return NextResponse.json({
      ok: true,
      profile: {
        displayName,
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
      portrait,
      emotionTrend,
      progressRecords,
    });

  } catch (err) {
    console.error('[Dashboard] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
