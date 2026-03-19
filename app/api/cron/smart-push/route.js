/**
 * 智慧推播 Cron Job
 *
 * 每天下午 3 點（台灣時間）跑一次
 * 只推給「正在上課 + 最近沒互動」的學員
 * 用學員自己的互動數據決定推什麼
 *
 * Vercel Cron: 在 vercel.json 設定 "crons": [{ "path": "/api/cron/smart-push", "schedule": "0 7 * * *" }]
 * (UTC 7:00 = 台灣 15:00)
 */

import { NextResponse } from 'next/server';
import { pushMessage } from '@/lib/line';
import { getSupabase } from '@/lib/supabase';
import { Redis } from '@upstash/redis';

const CLASS_PREFIX = 'coach-class:';
const PUSH_LOG_PREFIX = 'coach-push-log:'; // 記錄上次推播時間，避免重複

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

export async function GET(request) {
  // 驗證是 Vercel Cron 或手動觸發
  const authHeader = request.headers.get('authorization');
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isAdmin = request.headers.get('x-admin-key') === process.env.ADMIN_API_KEY;

  if (!isVercelCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabase();
  const r = getRedis();
  if (!sb) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    // 1. 取得所有有 class_name 的用戶（含群組活動時間）
    const { data: users } = await sb.from('users')
      .select('id, display_name, class_name, updated_at, last_group_activity')
      .not('class_name', 'is', null);

    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, message: 'No students found', pushed: 0 });
    }

    // 2. 取得班級開學日期
    const classNames = [...new Set(users.map(u => u.class_name).filter(Boolean))];
    const classMap = {};
    for (const cn of classNames) {
      const data = await r.get(`${CLASS_PREFIX}${cn}`);
      if (data) classMap[cn] = typeof data === 'string' ? JSON.parse(data) : data;
    }

    const now = new Date();
    let pushed = 0;
    const log = [];

    for (const user of users) {
      const userId = user.id;
      const name = user.display_name || '同學';
      const classInfo = classMap[user.class_name];

      // 跳過沒有班級資訊或課程已結束的
      if (!classInfo?.startDate) continue;
      const startDate = new Date(classInfo.startDate);
      const endDate = classInfo.endDate ? new Date(classInfo.endDate) : null;
      if (now < startDate) continue; // 還沒開學
      if (endDate && now > endDate) continue; // 已結業

      // 3. 查最後互動時間
      const { data: lastConv } = await sb.from('conversations')
        .select('created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(1);

      const lastInteraction = lastConv?.[0]?.created_at;
      const daysSinceLastInteraction = lastInteraction
        ? Math.floor((now - new Date(lastInteraction)) / (1000 * 60 * 60 * 24))
        : 999;

      // 也檢查群組活動時間
      const lastGroupActivity = user.last_group_activity;
      const daysSinceGroupActivity = lastGroupActivity
        ? Math.floor((now - new Date(lastGroupActivity)) / (1000 * 60 * 60 * 24))
        : 999;

      // 任何一邊活躍就不打擾（群組有發言 OR 小幫手有互動）
      const daysSilent = Math.min(daysSinceLastInteraction, daysSinceGroupActivity);
      if (daysSilent <= 2) continue; // 3天內任何活動 = 不推

      // 4. 查上次推播時間（避免連續推）
      const lastPush = await r.get(`${PUSH_LOG_PREFIX}${userId}`);
      if (lastPush) {
        const daysSincePush = Math.floor((now - new Date(lastPush)) / (1000 * 60 * 60 * 24));
        if (daysSincePush < 3) continue; // 3天內推過就不再推
      }

      // 5. 取得互動次數
      const { count: totalInteractions } = await sb.from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('role', 'user');

      // 6. 根據狀態決定推播內容
      let message = '';

      if (daysSilent >= 7) {
        // 7天以上沒來：用成果拉回來
        if (totalInteractions > 10) {
          message = `${name}，你之前跟我聊了${totalInteractions}次，每一次都是你在為自己做的選擇。最近有遇到什麼新的狀況嗎？不管什麼都可以跟我聊 😊`;
        } else {
          message = `${name}，最近還好嗎？如果外食不知道怎麼選，按下面選單的「下一餐吃什麼」，跟我說你在哪吃，我幫你想搭配 😊`;
        }
      } else if (daysSilent >= 3) {
        // 3-7天沒來：用有趣的內容鉤子
        const hooks = [
          `${name}，你知道嗎？很多人以為玉米是蔬菜，其實它是澱粉！類似的隱藏分類還有不少。要不要考考自己？按「這個能吃嗎」試試看 😄`,
          `${name}，最近很多同學在問：便利商店到底怎麼搭配最方便？我整理了一個萬用組合，你想看看嗎？`,
          `${name}，分享一個小撇步：自助餐三格配菜都選蔬菜，才剛好一餐的蔬菜量。聽起來很多？其實試了就知道很快就吃完 😄`,
          `${name}，最近有沒有遇到不知道能不能吃的食物？直接問我就好，什麼都可以問 ☺️`,
        ];
        message = hooks[Math.floor(Math.random() * hooks.length)];
      }

      if (!message) continue;

      // 7. 推播
      try {
        await pushMessage(userId, message);
        await r.set(`${PUSH_LOG_PREFIX}${userId}`, now.toISOString(), { ex: 86400 * 7 }); // 7天後過期
        pushed++;
        log.push({ name, daysSilent, dmDays: daysSinceLastInteraction, groupDays: daysSinceGroupActivity, interactions: totalInteractions || 0 });
        console.log(`[SmartPush] Pushed to ${name} (${daysSilent}d silent: dm=${daysSinceLastInteraction}d, group=${daysSinceGroupActivity}d, ${totalInteractions || 0} interactions)`);
      } catch (err) {
        console.error(`[SmartPush] Failed for ${userId}:`, err.message);
      }
    }

    return NextResponse.json({ ok: true, pushed, total: users.length, log });
  } catch (err) {
    console.error('[SmartPush] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
