/**
 * 智慧推播 Cron Job
 *
 * 每天下午 3 點（台灣時間）跑一次
 * 兩種推播並存：
 * 1. 沉默推播：3天+ 沒互動 → 推內容鉤子
 * 2. 課程進度推播：每週一次 → 個性化的課程階段訊息
 *
 * Vercel Cron: "0 7 * * *" (UTC 7:00 = 台灣 15:00)
 */

import { NextResponse } from 'next/server';
import { pushMessage } from '@/lib/line';
import { getSupabase } from '@/lib/supabase';
import { Redis } from '@upstash/redis';

const CLASS_PREFIX = 'coach-class:';
const PUSH_LOG_PREFIX = 'coach-push-log:';
const WEEK_LOG_PREFIX = 'coach-week-push:'; // 記錄上次推播的課程週數

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

// ===== 課程進度推播內容（按週數）=====
function getWeeklyMessage(week, name, totalInteractions) {
  const interactionNote = totalInteractions > 5
    ? `你已經跟我聊了${totalInteractions}次了，每一次都是你在為自己的健康做選擇，這些都在累積 ☺️`
    : '';

  const messages = {
    1: `${name}，第一週怎麼樣？最重要的就是一件事：菜肉飯順序。其他的慢慢來就好。\n\n有遇到不知道能不能吃的嗎？直接問我就好 😊`,

    2: `${name}，第二週了！到現在有沒有發現：其實外食也沒那麼難搭？\n\n我整理了不同場景的搭配（便利商店、自助餐、早餐店⋯），你想看看嗎？👉 https://coach-line-bot.vercel.app/guide`,

    3: `${name}，課程到第三週了。跟你說一件事：接下來你可能會有幾天覺得「好像沒那麼容易了」。幾乎每個人都會，這很正常。\n\n休校長說：60-80分就很棒了，不需要100分。遇到什麼狀況都可以跟我聊 ☺️`,

    4: `${name}，第四週了。休校長說過：「不吃什麼比較難，但增加什麼容易得多。」\n\n這週不用跟上週比，專注當週就好。有做到的就是進步 💪\n\n${interactionNote}`,

    5: `${name}，五週了！看看最近衣服有沒有變鬆？肚子摸起來有沒有變軟？\n\n如果有——那就是在進步。脂肪在離場了，體重計不是唯一指標。\n\n體態的改變比數字更真實 ☺️`,

    6: `${name}，已經走了六週了。回頭看看第一週的自己——是不是不一樣了？\n\n知道怎麼選食物、知道外食怎麼搭、知道什麼是澱粉什麼是蛋白質。這些都是你一餐一餐累積出來的。\n\n${interactionNote}`,

    7: `${name}，倒數了！休校長說：「你不是重新開始，你是帶著經驗繼續前進。」\n\n不管中間有沒有哪天沒做好，你到現在都還在——這件事本身就值得肯定 ☺️`,

    8: `${name}，兩個月了！回想第一週連食物分類都搞不清楚，現在是不是看到什麼都會自動歸類了？\n\n這個改變是你一餐一餐累積出來的 ☺️\n\n${interactionNote}`,

    9: `${name}，第九週了。有沒有發現身邊的人開始問你「你最近怎麼變瘦了」？\n\n如果有——恭喜你。如果還沒——繼續做，他們遲早會問 😄`,

    10: `${name}，課程已經過了大半。這時候最重要的不是數字，是你建立起來的習慣。\n\n休校長說：「你是想瘦一陣子，還是瘦一輩子？」你現在學會的，是一輩子都能用的方法 ☺️`,

    11: `${name}，倒數了！不管中間有沒有哪天沒做好，你到現在都還在——這件事本身就值得肯定。\n\n休校長說：「你不是重新開始，你是帶著經驗繼續前進。」\n\n${interactionNote}`,

    12: `${name}，最後一週了。\n\n不管數字怎麼樣，你已經學會了一套可以用一輩子的方法。這才是最重要的。\n\n「瘦是健康的附加價值。當你變健康了，瘦就是自然而然的事。」\n\n我是休校長小幫手，陪你健康的瘦一輩子 ☺️`,
  };

  return messages[week] || null;
}

// ===== 沉默推播內容 =====
function getSilentMessage(daysSilent, name, totalInteractions) {
  if (daysSilent >= 7) {
    if (totalInteractions > 10) {
      return `${name}，你之前跟我聊了${totalInteractions}次，每一次都是你在為自己做的選擇。最近有遇到什麼新的狀況嗎？不管什麼都可以跟我聊 😊`;
    }
    return `${name}，最近還好嗎？如果外食不知道怎麼選，按下面選單的「下一餐吃什麼」，跟我說你在哪吃，我幫你想搭配 😊`;
  }

  // 3-7天
  const hooks = [
    `${name}，你知道嗎？很多人以為玉米是蔬菜，其實它是澱粉！類似的隱藏分類還有不少。要不要考考自己？按「這個能吃嗎」試試看 😄`,
    `${name}，最近很多同學在問：便利商店到底怎麼搭配最方便？我整理了一個萬用組合，你想看看嗎？`,
    `${name}，分享一個小撇步：自助餐三格配菜都選蔬菜，才剛好一餐的蔬菜量。聽起來很多？其實試了就知道很快就吃完 😄`,
    `${name}，最近有沒有遇到不知道能不能吃的食物？直接問我就好，什麼都可以問 ☺️`,
  ];
  return hooks[Math.floor(Math.random() * hooks.length)];
}

// ===== 計算課程週數（扣除停課）=====
function calcCourseWeek(classInfo, now) {
  const start = new Date(classInfo.startDate);
  let diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 0;

  let pauseDays = 0;
  if (classInfo.pauseStart && classInfo.pauseEnd) {
    const ps = new Date(classInfo.pauseStart);
    const pe = new Date(classInfo.pauseEnd);
    const isPaused = now >= ps && now <= pe;
    if (isPaused) return -1; // 停課中
    if (now > pe) pauseDays = Math.floor((pe - ps) / (1000 * 60 * 60 * 24)) + 1;
  }

  return Math.floor((diffDays - pauseDays) / 7) + 1;
}

export async function GET(request) {
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
    const { data: users } = await sb.from('users')
      .select('id, display_name, class_name, updated_at, last_group_activity')
      .not('class_name', 'is', null);

    if (!users || users.length === 0) {
      return NextResponse.json({ ok: true, message: 'No students found', pushed: 0 });
    }

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

      if (!classInfo?.startDate) continue;
      const startDate = new Date(classInfo.startDate);
      const endDate = classInfo.endDate ? new Date(classInfo.endDate) : null;
      if (now < startDate) continue;
      if (endDate && now > endDate) continue;

      // 計算課程週數
      const courseWeek = calcCourseWeek(classInfo, now);
      if (courseWeek === -1) continue; // 停課中
      if (courseWeek < 1 || courseWeek > 12) continue;

      // 查最後互動時間
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

      const lastGroupActivity = user.last_group_activity;
      const daysSinceGroupActivity = lastGroupActivity
        ? Math.floor((now - new Date(lastGroupActivity)) / (1000 * 60 * 60 * 24))
        : 999;

      const daysSilent = Math.min(daysSinceLastInteraction, daysSinceGroupActivity);

      // 查上次推播（避免連續推）
      const lastPush = await r.get(`${PUSH_LOG_PREFIX}${userId}`);
      if (lastPush) {
        const daysSincePush = Math.floor((now - new Date(lastPush)) / (1000 * 60 * 60 * 24));
        if (daysSincePush < 3) continue;
      }

      // 取得互動次數
      const { count: totalInteractions } = await sb.from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('role', 'user');

      let message = '';
      let pushType = '';

      // === 優先判斷：課程進度推播（每週一次）===
      const lastWeekPushed = await r.get(`${WEEK_LOG_PREFIX}${userId}`);
      const lastWeekNum = lastWeekPushed ? parseInt(lastWeekPushed) : 0;

      if (courseWeek > lastWeekNum) {
        // 進入新的一週，推課程進度
        message = getWeeklyMessage(courseWeek, name, totalInteractions || 0);
        pushType = `week${courseWeek}`;
      }

      // === 次要判斷：沉默推播（3天+沒互動）===
      if (!message && daysSilent >= 3) {
        message = getSilentMessage(daysSilent, name, totalInteractions || 0);
        pushType = daysSilent >= 7 ? 'silent-7d' : 'silent-3d';
      }

      if (!message) continue;

      // 推播
      try {
        await pushMessage(userId, message);
        await r.set(`${PUSH_LOG_PREFIX}${userId}`, now.toISOString(), { ex: 86400 * 7 });

        // 記錄課程週數推播
        if (pushType.startsWith('week')) {
          await r.set(`${WEEK_LOG_PREFIX}${userId}`, String(courseWeek), { ex: 86400 * 60 });
        }

        pushed++;
        log.push({ name, week: courseWeek, type: pushType, daysSilent });
        console.log(`[SmartPush] ${name}: ${pushType} (week${courseWeek}, silent=${daysSilent}d)`);
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
