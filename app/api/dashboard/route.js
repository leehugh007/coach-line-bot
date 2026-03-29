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
 * 生成「小幫手眼中的你」— 人格觀察
 *
 * 邏輯：
 * 1. 提取完整素材（journey + tags + goals + milestones + selfChecks + progress + stats）
 * 2. AI 綜合生成人格觀察
 * 3. 存 Redis，以 journey 版本（長度 hash）判斷是否需要重新生成
 *    journey 每 10 次對話更新一次，portrait 跟著演進
 */
async function getPortrait(userId, { displayName, journey, progressRecords, emotionTrend, goals, milestones, selfChecks, stats, quizCollected, knowledgeCollected }, forceRefresh = false) {
  const r = getRedis();
  const cacheKey = `coach-portrait:${userId}`;
  const PORTRAIT_TTL = 14 * 24 * 60 * 60; // 2 週快取

  // 查快取（2 週 TTL），forceRefresh 可強制重新生成
  if (!forceRefresh) {
    const cached = await r.get(cacheKey);
    if (cached) return cached;
  }

  // 素材門檻：至少 30 次對話才生成（要夠了解才寫得出有溫度的觀察）
  if (stats.totalConversations < 30) {
    return '多聊幾次，小幫手就能更認識你 😊\n目前我們還在熟悉彼此，等對話再多一些，這裡會出現我對你的真實觀察。';
  }

  // ── 拉學員原始對話（最重要的素材來源）──
  let userQuotes = [];
  try {
    const sb = getSupabase();
    if (sb) {
      const { data: convos } = await sb
        .from('conversations')
        .select('content')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(200);

      if (convos) {
        // 篩選有意義的訊息：>20字、不是純客套話
        const skipPattern = /^(好|OK|ok|謝謝|感謝|收到|了解|嗯嗯|早安|午安|晚安|哈哈|讚|👍|❤️|💪|可以|好的|對|是)[!！。~～]*$/i;
        userQuotes = convos
          .map(c => c.content)
          .filter(t => t && t.length > 20 && !skipPattern.test(t.trim()))
          .slice(0, 30) // 取最多 30 則有意義的
          .map(t => t.substring(0, 150)); // 每則截取 150 字
      }
    }
  } catch (err) {
    console.error('[Portrait] Fetch conversations error:', err.message);
  }

  // ── 組合素材 ──
  const fixName = (text) => text?.replace(/這位學員|學員|學生/g, displayName) || '';

  // 核心素材：學員自己說過的話
  const quotesBlock = userQuotes.length > 0
    ? `【${displayName}說過的話（原文，最重要的素材）】\n${userQuotes.map(q => `「${q}」`).join('\n')}`
    : '';

  // 背景素材
  const journeyBlock = journey ? `【旅程背景】\n${fixName(journey).substring(0, 400)}` : '';
  const progressBlock = (progressRecords || []).length > 0
    ? `【做到的改變】\n${progressRecords.slice(0, 5).map(p => `- ${fixName(p.detail)}`).join('\n')}`
    : '';
  const statsBlock = `【互動】活躍 ${stats.activeDays} 天、對話 ${stats.totalConversations} 次`;

  const materials = [quotesBlock, progressBlock, journeyBlock, statsBlock].filter(Boolean).join('\n\n');

  const prompt = `你是「休校長小幫手」。你跟${displayName}聊了很多次，現在要寫一段話放在他的個人頁面上，標題叫「小幫手眼中的你」。

核心目的：讓${displayName}看到「她自己看不到的好」。

大部分學員只看到自己的不好——又破戒了、又沒做到、體重又沒動。
你的任務是從她說過的話和做過的事裡，找到她的好：
- 她的行動力（她做了什麼，不管多小）
- 她努力想改變自己的意念（她為什麼還在這裡聊天？因為她沒放棄）
- 她善待身體的那些時刻（選了什麼、問了什麼、觀察了什麼）

以下是你的素材：

${materials}

【怎麼寫——最重要】
1. 引用她說過的原話（「你說過⋯⋯」）——這是讓她覺得「你真的有在聽」的關鍵
2. 點出一個她自己可能沒注意到的改變——「你可能覺得沒什麼，但⋯⋯」
3. 用具體的行為說她的好，不要用形容詞（「你會把零食買了放著不一定吃」比「你很有自制力」好一百倍）

【語氣】
溫暖、直接、口語。像朋友在 LINE 跟她說真心話。
禁止：AI 分析腔、心理學術語、考績評語、心靈雞湯、「展現了」「迷人的」「積極的態度」。

【格式】
- 用「你」稱呼，直接叫名字不加「學員」
- 2-3 段，每段 1-2 句話
- 總共 120-180 字
- 最後一句要具體（跟這個人的經歷有關），不要「加油」「相信自己」
- 直接開始寫，不要開場白`;

  // 優先 Claude Haiku（寫作品質更好），Gemini fallback
  let text = null;
  const cached = await r.get(cacheKey);

  const claudeKey = process.env.CLAUDE_API_KEY;
  if (claudeKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
      });
      if (res.ok) {
        const data = await res.json();
        text = data.content?.[0]?.text?.trim();
        if (text) console.log(`[Portrait] Claude Haiku OK: ${text.length} chars for ${displayName}`);
      } else {
        console.warn(`[Portrait] Claude failed: ${res.status}`);
      }
    } catch (err) {
      console.warn('[Portrait] Claude error:', err.message);
    }
  }

  // Gemini fallback
  if (!text) {
    try {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) return cached || null;

      console.log(`[Portrait] Fallback to Gemini for ${displayName}`);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      }
    } catch (err) {
      console.error('[Portrait] Gemini error:', err.message);
    }
  }

  if (!text) return cached || null;

  console.log(`[Portrait] Generated ${text.length} chars for ${displayName}`);
  await r.set(cacheKey, text, { ex: PORTRAIT_TTL });
  return text;
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
      sb.from('milestones').select('content, type, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
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

    // 生成「小幫手眼中的你」（完整素材 → AI → 快取 7 天）
    const forceRefresh = searchParams.get('refresh') === '1';
    const portrait = await getPortrait(userId, {
      displayName,
      journey: userRes.data?.journey,
      progressRecords,
      emotionTrend,
      goals: goalsRes.data || [],
      milestones: (milestonesRes.data || []),
      selfChecks: selfCheckRes.data || [],
      stats: { activeDays, totalConversations: convoCountRes.count || 0 },
      quizCollected,
      knowledgeCollected,
    }, forceRefresh);

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
