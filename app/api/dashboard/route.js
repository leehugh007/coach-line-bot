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

  // 查快取（7 天 TTL），forceRefresh 可強制重新生成
  if (!forceRefresh) {
    const cached = await r.get(cacheKey);
    if (cached) return cached;
  }

  // 素材不夠就不生成
  if (!journey && (!progressRecords || progressRecords.length === 0) && (!emotionTrend || emotionTrend.length === 0)) {
    return null;
  }

  // ── 組合完整素材 ──

  // 把「學員」「學生」「這位學員」替換成名字（journey 和 progress 裡的稱呼問題）
  const fixName = (text) => text.replace(/這位學員|學員|學生/g, displayName);

  // 旅程（AI 已整理的完整故事）
  const journeyBlock = journey ? `【旅程紀錄】\n${fixName(journey)}` : '';

  // 進步紀錄（AI 從對話中偵測到的真實改變）
  const progressBlock = (progressRecords || []).length > 0
    ? `【進步紀錄】\n${progressRecords.slice(0, 8).map(p => `- ${fixName(p.detail)}`).join('\n')}`
    : '';

  // 情緒變化軌跡
  const emotionBlock = (emotionTrend || []).length >= 3
    ? `【情緒變化】\n${emotionTrend.map(e => e.emotion).join(' → ')}`
    : '';

  // 目標（設定過什麼、完成了什麼）
  const activeGoals = (goals || []).filter(g => g.status === 'active');
  const completedGoals = (goals || []).filter(g => g.status === 'completed');
  const goalBlock = (goals || []).length > 0
    ? `【目標】\n${activeGoals.map(g => `進行中：${g.goal_text}`).join('\n')}${completedGoals.length > 0 ? `\n已完成 ${completedGoals.length} 個目標` : ''}`
    : '';

  // 里程碑
  const milestoneBlock = (milestones || []).length > 0
    ? `【里程碑】\n已達成：${milestones.map(m => m.milestone).join('、')}`
    : '';

  // 自我覺察趨勢
  const checkBlock = (selfChecks || []).length > 0
    ? `【自我覺察】\n最近分數：${selfChecks.slice(0, 5).map(c => c.total_score).join(' → ')}（滿分 25）`
    : '';

  // 學習投入
  const learningBlock = (quizCollected > 0 || knowledgeCollected > 0)
    ? `【學習投入】\n食物知識：認識 ${quizCollected} 種、瘦身知識：答對 ${knowledgeCollected} 題`
    : '';

  // 互動統計
  const statsBlock = `【互動】\n活躍 ${stats.activeDays} 天、對話 ${stats.totalConversations} 次`;

  const materials = [journeyBlock, progressBlock, emotionBlock, goalBlock, milestoneBlock, checkBlock, learningBlock, statsBlock]
    .filter(Boolean).join('\n\n');

  const prompt = `你是「休校長小幫手」。你跟${displayName}聊了很多次，現在要寫一段話放在他的個人頁面上，標題叫「小幫手眼中的你」。

這段話的目的：讓${displayName}看完覺得「原來你是這樣看我的」——被理解、被看見。

以下是你從所有互動中觀察到的：

${materials}

【你要寫什麼】
從上面的素材裡找出這個人的「人」——
他面對困難時是什麼反應？（逃避？硬撐？還是想辦法？）
他用心的地方在哪？（主動學？默默做？還是會問為什麼？）
他有什麼改變是他自己可能沒注意到的？

寫這些。不要寫他的目標、他的菜單、他的數字——那些頁面其他地方已經有了。

【語氣——最重要】
你說話的方式跟一休一樣：溫暖、直接、口語。
像朋友在 LINE 上跟他說話，不是在寫報告。

好的語氣範例：
「說真的，你是那種不會只照做的人。你會想知道為什麼，想通了才願意動。」
「你不是沒遇過卡關，但你每次的反應都是再試一次，不是算了。光是這個，就跟大部分的人不一樣。」
「我記得你從一開始什麼都不確定，到現在會自己判斷該怎麼吃。這個變化你可能覺得沒什麼，但我覺得很厲害。」

壞的語氣（絕對禁止）：
- 「像一位研究者般」「將經驗轉化為深刻洞察」「迷人的特質」 → AI 分析腔，刪
- 「這是一段為你撰寫的文字」 → meta 語句，刪
- 「受害者轉化為掌控者」 → 心理學術語，刪
- 「展現了積極的態度與顯著的進展」 → 考績評語，刪
- 任何聽起來像論文、像評語、像心靈雞湯的句子 → 全部砍掉

【格式】
- 用「你」稱呼
- 2-3 段，每段 1-2 句話
- 總共 120-160 字
- 最後一句要具體（跟這個人的經歷有關），不要「加油」「相信自己」
- 直接開始寫，不要任何開場白或自我介紹`;

  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.error('[Portrait] GEMINI_API_KEY not set');
      return cached || null;
    }

    console.log(`[Portrait] Generating for ${displayName} (journey=${journey?.length || 0}, progress=${progressRecords?.length || 0})`);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Portrait] Gemini HTTP ${res.status}:`, errText.substring(0, 200));
      return cached || null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      console.error('[Portrait] Gemini returned empty. Response:', JSON.stringify(data).substring(0, 300));
      return cached || null;
    }

    console.log(`[Portrait] Generated ${text.length} chars for ${displayName}`);

    // 快取 7 天
    await r.set(cacheKey, text, { ex: 7 * 24 * 60 * 60 });
    return text;
  } catch (err) {
    console.error('[Portrait] Error:', err.message);
  }

  // 生成失敗時回傳舊的快取（如果有）
  return cached || null;
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
