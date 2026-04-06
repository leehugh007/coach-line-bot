/**
 * 智慧推播 Cron Job
 *
 * 四種排程：
 * 1. ?type=weekly     — 每週三 08:00 台灣 → 課程進度推播（12 週）
 * 2. ?type=evening    — 每天 20:10 台灣 → 沉默推播（2天+）+ 第11週五續報暖場
 * 3. ?type=renewal-noon — 每週四 12:15 台灣 → 第12週續報提醒
 * 4. ?type=abc-quiz   — 每週六 10:00 台灣 → ABC 小挑戰（當週任務 quiz）
 *
 * Vercel Cron（UTC）：
 *   "0 0 * * 3"    → 週三 08:00 台灣
 *   "10 12 * * *"   → 每天 20:10 台灣
 *   "15 4 * * 4"    → 週四 12:15 台灣
 *   "0 2 * * 6"    → 週六 10:00 台灣
 */

import { NextResponse } from 'next/server';
import { pushMessage, pushWithQuickReply } from '@/lib/line';
import { addChatMessage } from '@/lib/chat';
import { getSupabase } from '@/lib/supabase';
import { getActiveGoal } from '@/lib/user';
import { Redis } from '@upstash/redis';

const CLASS_PREFIX = 'coach-class:';
const PUSH_LOG_PREFIX = 'coach-push-log:';      // 通用推播紀錄（1天冷卻）
const WEEK_LOG_PREFIX = 'coach-week-push:';      // 課程週數推播紀錄
const RENEWAL_LOG_PREFIX = 'coach-renewal-push:'; // 續報推播紀錄
const PUSH_HISTORY_KEY = 'coach-push-history';    // 推播紀錄（LIST, max 100）

function getRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

/** 取得台灣時間的星期幾（0=Sun） */
function getTaiwanDayOfWeek() {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.getUTCDay();
}

/** 計算課程週數（扣除停課）*/
function calcCourseWeek(classInfo, now) {
  const start = new Date(classInfo.startDate);
  let diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 0;

  let pauseDays = 0;
  if (classInfo.pauseStart && classInfo.pauseEnd) {
    const ps = new Date(classInfo.pauseStart);
    const pe = new Date(classInfo.pauseEnd);
    if (now >= ps && now <= pe) return -1; // 停課中
    if (now > pe) pauseDays = Math.floor((pe - ps) / (1000 * 60 * 60 * 24)) + 1;
  }

  return Math.floor((diffDays - pauseDays) / 7) + 1;
}

/** 載入有 class_name 的學員 + 班級資料 */
async function loadStudentsAndClasses(sb, r) {
  const { data: users } = await sb.from('users')
    .select('id, display_name, class_name, updated_at, last_group_activity')
    .not('class_name', 'is', null);

  if (!users || users.length === 0) return { users: [], classMap: {} };

  const classNames = [...new Set(users.map(u => u.class_name).filter(Boolean))];
  const classMap = {};
  for (const cn of classNames) {
    const data = await r.get(`${CLASS_PREFIX}${cn}`);
    if (data) classMap[cn] = typeof data === 'string' ? JSON.parse(data) : data;
  }

  return { users, classMap };
}

/** 檢查今天是否已推過（1天冷卻）*/
async function wasPushedToday(r, userId) {
  const last = await r.get(`${PUSH_LOG_PREFIX}${userId}`);
  if (!last) return false;
  const hours = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60);
  return hours < 20; // 20小時內算同一天
}

/** 記錄推播 */
async function recordPush(r, userId) {
  await r.set(`${PUSH_LOG_PREFIX}${userId}`, new Date().toISOString(), { ex: 86400 * 2 });
}

/** 記錄推播歷史（供後台查看）*/
async function logPushHistory(r, name, type, preview) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    name,
    type,
    preview: (preview || '').substring(0, 80),
  });
  await r.lpush(PUSH_HISTORY_KEY, entry);
  await r.ltrim(PUSH_HISTORY_KEY, 0, 99); // 保留最新 100 筆
  await r.expire(PUSH_HISTORY_KEY, 86400 * 30); // 30 天過期
}

// ===================================================================
// 課程進度推播內容（12 週 + Quick Reply）
// ===================================================================

function getWeeklyMessage(week, name) {
  const messages = {
    1: {
      text: `${name}，便利商店其實可以組出完美的 ABC 餐 — 茶葉蛋＋生菜沙拉＋地瓜，不到100元。\n\n你平常最常在哪裡買午餐？我幫你搭 😊`,
      qr: [
        { label: '🏪 便利商店', text: '便利商店可以買什麼ABC搭配' },
        { label: '🍱 自助餐', text: '自助餐怎麼夾比較健康' },
        { label: '🥞 早餐店', text: '早餐店怎麼點比較好' },
        { label: '🏠 自己煮', text: '自己煮的話怎麼搭配ABC' },
      ],
    },
    2: {
      text: `${name}，考你一題：玉米、蓮藕、南瓜、山藥 — 這四樣全部都是澱粉，你答對了嗎？\n\n很多同學到第二週還是會搞混。沒關係，知道了就不會再錯 😄`,
      qr: [
        { label: '再考我一題', text: '再考我一題食物分類' },
        { label: '我有食物想問', text: '我想問其他食物能不能吃' },
        { label: '幫我搭午餐', text: '幫我搭今天的午餐' },
      ],
    },
    3: {
      text: `${name}，如果昨天不小心吃了炸雞排，你覺得今天該怎麼做？\n\nA. 少吃一點補回來\nB. 跳過一餐\nC. 當作沒發生，正常吃\n\n答案可能跟你想的不一樣 😄`,
      qr: [
        { label: '公布答案', text: '吃了炸雞排隔天該怎麼辦' },
        { label: '我最近有類似狀況', text: '我最近有吃不該吃的東西' },
        { label: '目前都還順利', text: '目前飲食都還算順利' },
      ],
    },
    4: {
      text: `${name}，一個月了。問你一件事 — 最近有沒有覺得「褲子好像鬆了一點」或「臉好像小了」？\n\n體重計不一定有變，但身體已經在改變了。脂肪正在離場，只是它不會跟你說再見 😄`,
      qr: [
        { label: '有，衣服變鬆了', text: '最近衣服有變鬆的感覺' },
        { label: '還沒感覺到', text: '一個月了但還沒什麼感覺' },
        { label: '體重卡住了', text: '體重卡住了怎麼辦' },
      ],
    },
    5: {
      text: `${name}，很多同學跟我說第五週開始覺得「好像沒那麼容易了」。\n\n跟你說一個秘密：這不是退步，是你的身體在適應新的代謝模式。幾乎每個人都會經歷。\n\n休校長說：60-80 分就很棒了，不需要 100 分。\n\n不看體重的話，你有沒有注意到身體其他的變化？`,
      qr: [
        { label: '有，精神變好了', text: '最近精神確實有變好' },
        { label: '衣服好像鬆了', text: '最近衣服有變鬆的感覺' },
        { label: '最近有點卡', text: '最近飲食確實有點卡關' },
        { label: '還沒什麼感覺', text: '五週了但還沒什麼感覺' },
      ],
    },
    6: {
      text: `${name}，聚餐、應酬、家人煮的飯 — 你這幾週應該都遇過了吧？\n\n分享一個很多同學覺得最實用的技巧：先吃一碗菜、再吃肉，最後才碰飯。桌上有什麼吃什麼，只是順序不同。`,
      qr: [
        { label: '聚餐真的好難', text: '聚餐的時候真的很難控制飲食' },
        { label: '火鍋怎麼吃', text: '火鍋怎麼吃比較好' },
        { label: '我想問其他場景', text: '其他外食場景怎麼搭配' },
      ],
    },
    7: {
      text: `${name}，到第七週了，你現在去自助餐夾菜的時候，是不是已經會自動先看蔬菜區了？\n\n如果是 — 這個「自動化」就是你最大的收穫。你不是靠意志力在撐，是習慣在幫你做選擇。`,
      qr: [
        { label: '確實變自動了', text: '確實現在選食物比較自動了' },
        { label: '還是要刻意想', text: '選食物還是需要刻意想' },
        { label: '自助餐怎麼夾', text: '自助餐怎麼夾比較健康' },
      ],
    },
    8: {
      text: `${name}，兩個月了。休校長說過一句話：「你是想瘦一陣子，還是瘦一輩子？」\n\n你現在學會的不是一個「減肥法」，是一套吃飯的方法。課程結束後這些都帶著走。\n\n最近有沒有什麼飲食上拿不準的？趁還在課程裡，什麼都可以問 😊`,
      qr: [
        { label: '我有食物想問', text: '我想問其他食物能不能吃' },
        { label: '幫我搭下一餐', text: '幫我搭今天的午餐' },
        { label: '想聊心態', text: '最近心態有點卡關' },
      ],
    },
    9: {
      text: `${name}，有沒有人最近問你「你是不是瘦了」？\n\n如果有 — 恭喜，你的改變被看見了。\n如果還沒 — 也正常，每天看你的人最慢發現。繼續做，他們遲早會問 😄`,
      qr: [
        { label: '有人說我變瘦了', text: '最近有人說我變瘦了' },
        { label: '還沒被發現', text: '還沒有人發現我的變化' },
        { label: '想看看自己的變化', text: '我想知道自己有什麼變化' },
      ],
    },
    10: {
      text: `${name}，倒數三週了。分享一個數據：能走到第十週的同學，課程結束後維持的比例超過七成。\n\n你已經在這七成裡面了。\n\n有沒有什麼問題是你一直想問但沒問的？趁現在 😊`,
      qr: [
        { label: '我有問題想問', text: '我有一個一直想問的問題' },
        { label: '幫我搭下一餐', text: '幫我搭今天的午餐' },
        { label: '目前很穩定', text: '目前飲食都蠻穩定的' },
      ],
    },
    11: {
      text: `${name}，倒數兩週了。趁還在課程裡，有沒有什麼一直想問但還沒問的？\n\n不管是食物分類、外食搭配、還是心態上的卡關，什麼都可以問，不用客氣 ☺️`,
      qr: [
        { label: '我有食物想問', text: '我想問其他食物能不能吃' },
        { label: '幫我搭下一餐', text: '幫我搭今天的午餐' },
        { label: '經期怎麼吃', text: '經前很想吃甜食怎麼辦' },
      ],
    },
    12: {
      text: `${name}，最後一週了。\n\n回想第一週連玉米是澱粉都搞不清楚，現在去自助餐是不是已經自動先夾菜了？\n\n這個「不用想就會做」就是你最大的收穫 — 帶得走的。\n\n課程結束後小幫手還在，什麼時候都可以來問。我是休校長小幫手，陪你健康的瘦一輩子 ☺️`,
      qr: [
        { label: '我有話想說', text: '課程要結束了我有話想說' },
        { label: '我有食物想問', text: '我想問其他食物能不能吃' },
        { label: '謝謝這段時間', text: '謝謝小幫手這段時間的陪伴' },
      ],
    },
  };

  return messages[week] || null;
}

// ===================================================================
// 沉默推播內容
// ===================================================================

function getSilentMessage(daysSilent, name, goalText = null, courseWeek = 1) {
  // 沉默 7+ 天 → 推知識小題目（降低互動門檻，不再問「你還好嗎」）
  if (daysSilent >= 7) {
    const quiz = getRandomQuizForSilent(courseWeek);
    if (quiz) {
      const optList = quiz.opts.map((o, i) => `${i + 1}. ${o}`).join('\n');
      return `${name}，考你一題 😄\n\n${quiz.q}\n\n${optList}\n\n回數字就好！`;
    }
    // fallback：沒有題目時用知識鉤子
    const fallbacks = [
      `${name}，你知道消化 100 大卡蛋白質，身體要花 25～30 大卡來處理嗎？所以多吃蛋白質，實際吸收的熱量更少 💪\n\n最近有什麼飲食問題嗎？直接問我就好 ☺️`,
      `${name}，很多人以為玉米是蔬菜，其實它是澱粉！類似的隱藏分類還有不少。按選單的「考考我」試試 😄`,
      `${name}，一休說：「環境會影響行為。」家裡沒零食就不會吃。你家冰箱現在有什麼？跟我說我幫你想搭配 😊`,
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  // 沉默 2-6 天 + 有目標：帶目標追蹤（多句隨機）
  if (goalText) {
    const goalMsgs = [
      `${name}，上次你說要試試看「${goalText}」，這幾天做得怎麼樣？\n\n做到了很棒👍 沒做到也沒關係，跟我說狀況，我們一起調整 😊`,
      `${name}，「${goalText}」這個目標進展如何？不管做到幾成都算進步，跟我聊聊 ☺️`,
      `${name}，想到你之前設的目標「${goalText}」。有沒有什麼卡住的地方？卡住很正常，我們一起想辦法 😊`,
    ];
    return goalMsgs[Math.floor(Math.random() * goalMsgs.length)];
  }

  // 沉默 2-6 天 + 無目標：隨機知識鉤子
  const hooks = [
    `${name}，你知道嗎？很多人以為玉米是蔬菜，其實它是澱粉！類似的隱藏分類還有不少。要不要考考自己？按選單的「考考我」試試 😄`,
    `${name}，最近很多同學在問：便利商店到底怎麼搭配最方便？我整理了一個萬用組合，你想看看嗎？`,
    `${name}，分享一個小撇步：自助餐三格配菜都選蔬菜，才剛好一餐的蔬菜量。聽起來很多？其實試了就知道很快就吃完 😄`,
    `${name}，最近有沒有遇到不知道能不能吃的食物？直接問我就好，什麼都可以問 ☺️`,
    `${name}，考你一題：飯後走路的真正好處是什麼？A 燃燒大量卡路里 B 肌肉不靠胰島素就能吸收血糖 C 幫助消化\n\n回 A B C 就好 😄`,
  ];
  return hooks[Math.floor(Math.random() * hooks.length)];
}

/** 從 ABC_QUIZZES 隨機抽一題（優先抽當前課程週數的題） */
function getRandomQuizForSilent(courseWeek) {
  // 先試當前週數的題
  const weekQuizzes = ABC_QUIZZES[courseWeek];
  if (weekQuizzes && weekQuizzes.length > 0) {
    return weekQuizzes[Math.floor(Math.random() * weekQuizzes.length)];
  }
  // 沒有就從所有週隨機抽
  const allQuizzes = Object.values(ABC_QUIZZES).flat();
  if (allQuizzes.length === 0) return null;
  return allQuizzes[Math.floor(Math.random() * allQuizzes.length)];
}

// ===================================================================
// 續報推播內容（框定回覆，不走 AI）
// ===================================================================

function getRenewalWeek11Message(name) {
  return {
    text: `${name}，跟你聊一個事。\n\n大部分同學不是沒有瘦過，是瘦了之後沒維持住。休校長常說：「瘦身是徒弟，維持才是師父。」\n\n習慣真正內化需要 6-9 個月，你現在走了快 3 個月，基礎打好了，接下來是最關鍵的鞏固期。\n\n一個人撐跟有團隊陪，真的不一樣。有想過接下來怎麼做嗎？`,
    qr: [
      { label: '想了解怎麼繼續', text: '想了解怎麼繼續' },
      { label: '我覺得可以自己來', text: '我覺得可以自己來' },
      { label: '還在想', text: '還在想' },
    ],
  };
}

function getRenewalWeek12Message(name) {
  return {
    text: `${name}，快結業了，跟你說一下：續報名額有優先保留給你。\n\n很多學姐會選擇再花 1-2 期把習慣定錨下來，讓這次成為最後一次減重。\n\n有興趣的話直接到「Artemis線上減重班」官方帳號問助教就好 ☺️`,
    qr: [
      { label: '問助教續報方案', text: '問助教續報方案' },
      { label: '我再想想', text: '續報我再想想' },
      { label: '我有其他問題', text: '我有其他問題想問' },
    ],
  };
}

// ===================================================================
// 主入口：根據 type 分派
// ===================================================================

export const maxDuration = 120;

export async function GET(request) {
  const url = new URL(request.url);

  const authHeader = request.headers.get('authorization');
  const isVercelCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isAdmin = request.headers.get('x-admin-key') === process.env.ADMIN_API_KEY
    || url.searchParams.get('key') === process.env.ADMIN_API_KEY;

  if (!isVercelCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = url.searchParams.get('type') || 'weekly';
  const isDryRun = url.searchParams.get('dry') === '1';

  const sb = getSupabase();
  const r = getRedis();
  if (!sb) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  // Reset：清掉指定班級的週數推播紀錄
  const resetClass = url.searchParams.get('reset');
  if (resetClass) {
    const { users, classMap } = await loadStudentsAndClasses(sb, r);
    let cleared = 0;
    for (const user of users) {
      if (user.class_name !== resetClass) continue;
      await r.del(`${WEEK_LOG_PREFIX}${user.id}`);
      await r.del(`${PUSH_LOG_PREFIX}${user.id}`);
      cleared++;
    }
    return NextResponse.json({ ok: true, action: 'reset', class: resetClass, cleared });
  }

  // Dry run：只顯示會推給誰，不真的推
  if (isDryRun) {
    const { users, classMap } = await loadStudentsAndClasses(sb, r);
    const now = new Date();
    const preview = [];
    for (const user of users) {
      const classInfo = classMap[user.class_name];
      if (!classInfo?.startDate) continue;
      const start = new Date(classInfo.startDate);
      const end = classInfo.endDate ? new Date(classInfo.endDate) : null;
      if (now < start || (end && now > end)) continue;
      const week = calcCourseWeek(classInfo, now);
      if (week === -1 || week < 1 || week > 12) continue;
      const pushedToday = await wasPushedToday(r, user.id);
      preview.push({
        name: user.display_name || '?',
        className: user.class_name,
        week,
        pushedToday,
      });
    }
    return NextResponse.json({ ok: true, dryRun: true, type, total: preview.length, preview });
  }

  // 可選：只推指定班級
  const classOnly = url.searchParams.get('class');

  try {
    let { users, classMap } = await loadStudentsAndClasses(sb, r);
    if (classOnly) {
      users = users.filter(u => u.class_name === classOnly);
    }
    if (users.length === 0) {
      return NextResponse.json({ ok: true, message: 'No students found', pushed: 0 });
    }

    const now = new Date();
    let result;

    if (type === 'weekly') {
      result = await handleWeeklyPush(sb, r, users, classMap, now);
    } else if (type === 'evening') {
      result = await handleEveningPush(sb, r, users, classMap, now);
    } else if (type === 'renewal-noon') {
      result = await handleRenewalNoonPush(sb, r, users, classMap, now);
    } else if (type === 'abc-quiz') {
      result = await handleAbcQuizPush(sb, r, users, classMap, now);
    } else {
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, type, ...result });
  } catch (err) {
    console.error(`[SmartPush:${type}] Error:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ===================================================================
// 1. 課程進度推播（週三 8:00）
// ===================================================================

async function handleWeeklyPush(sb, r, users, classMap, now) {
  let pushed = 0;
  const log = [];

  for (const user of users) {
    const userId = user.id;
    const name = user.display_name || '同學';
    const classInfo = classMap[user.class_name];
    if (!classInfo?.startDate) continue;

    const startDate = new Date(classInfo.startDate);
    const endDate = classInfo.endDate ? new Date(classInfo.endDate) : null;
    if (now < startDate || (endDate && now > endDate)) continue;

    const courseWeek = calcCourseWeek(classInfo, now);
    if (courseWeek === -1 || courseWeek < 1 || courseWeek > 12) continue;

    // 檢查這週是否已推過
    const lastWeekPushed = await r.get(`${WEEK_LOG_PREFIX}${userId}`);
    const lastWeekNum = lastWeekPushed ? parseInt(lastWeekPushed) : 0;
    if (courseWeek <= lastWeekNum) continue;

    const msg = getWeeklyMessage(courseWeek, name);
    if (!msg) continue;

    try {
      // LINE Push API 不支援 Quick Reply，用數字選項
      const qrHint = msg.qr.map((q, i) => `${i + 1}. ${q.label}`).join('\n');
      const fullMsg = `${msg.text}\n\n回覆數字就好 😊\n${qrHint}`;
      await pushMessage(userId, fullMsg);
      // 存入對話紀錄讓 AI 知道上下文（學員回「1」時 AI 能接住）
      await addChatMessage(userId, 'assistant', fullMsg);
      await r.set(`${WEEK_LOG_PREFIX}${userId}`, String(courseWeek), { ex: 86400 * 60 });
      await recordPush(r, userId);

      pushed++;
      log.push({ name, week: courseWeek, type: `week${courseWeek}` });
      await logPushHistory(r, name, `課程第${courseWeek}週`, msg.text);
      console.log(`[Weekly] ${name}: week${courseWeek}`);
    } catch (err) {
      console.error(`[Weekly] Failed for ${name}:`, err.message);
      log.push({ name, week: courseWeek, type: 'error', error: err.message });
    }
  }

  return { pushed, total: users.length, log };
}

// ===================================================================
// 2. 每晚推播：沉默推播 + 第11週五續報（20:10）
// ===================================================================

async function handleEveningPush(sb, r, users, classMap, now) {
  let pushed = 0;
  const log = [];
  const isFriday = getTaiwanDayOfWeek() === 5;

  for (const user of users) {
    const userId = user.id;
    const name = user.display_name || '同學';
    const classInfo = classMap[user.class_name];
    if (!classInfo?.startDate) continue;

    const startDate = new Date(classInfo.startDate);
    const endDate = classInfo.endDate ? new Date(classInfo.endDate) : null;
    if (now < startDate || (endDate && now > endDate)) continue;

    const courseWeek = calcCourseWeek(classInfo, now);
    if (courseWeek === -1) continue;

    // 今天已推過 → 跳過（1天冷卻）
    if (await wasPushedToday(r, userId)) continue;

    // === 優先：第11週 + 星期五 → 續報暖場 ===
    if (isFriday && courseWeek === 11) {
      const renewalKey = `${RENEWAL_LOG_PREFIX}${userId}:w11`;
      const alreadySent = await r.get(renewalKey);
      if (!alreadySent) {
        const msg = getRenewalWeek11Message(name);
        try {
          const qrHint = msg.qr.map((q, i) => `${i + 1}. ${q.label}`).join('\n');
          const fullMsg = `${msg.text}\n\n回覆數字就好 😊\n${qrHint}`;
          await pushMessage(userId, fullMsg);
          await addChatMessage(userId, 'assistant', fullMsg);
          await r.set(renewalKey, now.toISOString(), { ex: 86400 * 30 });
          await recordPush(r, userId);
          pushed++;
          log.push({ name, week: courseWeek, type: 'renewal-w11' });
          await logPushHistory(r, name, '續報暖場', msg.text);
          console.log(`[Renewal] ${name}: week11 warm-up`);
        } catch (err) {
          console.error(`[Renewal] Failed for ${name}:`, err.message);
        }
        continue; // 續報推了就不推沉默
      }
    }

    // === 沉默推播 or 進步回顧：2天+ 沒互動 ===
    if (courseWeek < 1 || courseWeek > 12) continue;

    // 查最後互動
    const { data: lastConv } = await sb.from('conversations')
      .select('created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastInteraction = lastConv?.[0]?.created_at;
    const daysSinceInteraction = lastInteraction
      ? Math.floor((now - new Date(lastInteraction)) / (1000 * 60 * 60 * 24))
      : 999;

    const lastGroupActivity = user.last_group_activity;
    const daysSinceGroup = lastGroupActivity
      ? Math.floor((now - new Date(lastGroupActivity)) / (1000 * 60 * 60 * 24))
      : 999;

    const daysSilent = Math.min(daysSinceInteraction, daysSinceGroup);
    if (daysSilent < 2) continue; // 2天門檻

    // 沉默 7+ 天 → 每 3 天才推一次（避免每天轟炸）
    if (daysSilent >= 7) {
      const silentPushKey = `coach-silent-push:${userId}`;
      const lastSilentPush = await r.get(silentPushKey);
      if (lastSilentPush) {
        console.log(`[Silent] ${name}: 7d+ but pushed recently, skip`);
        continue;
      }
      // 推完設 3 天冷卻
      await r.set(silentPushKey, '1', { ex: 86400 * 3 });
    }

    // === 優先：進步回顧（有 3+ 筆進步紀錄且未回顧過）===
    const progressReviewKey = `coach-progress-review:${userId}`;
    const lastReviewCount = await r.get(progressReviewKey);
    const { data: progressRecords } = await sb.from('coaching_tags')
      .select('progress_detail, created_at')
      .eq('user_id', userId)
      .not('progress_detail', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    const progressItems = (progressRecords || []).filter(p => p.progress_detail);
    const newProgressCount = progressItems.length;
    const lastCount = lastReviewCount ? parseInt(lastReviewCount) : 0;

    if (newProgressCount >= 3 && newProgressCount > lastCount) {
      // 有新的進步紀錄可回顧
      const reviewItems = progressItems.slice(0, 5).map(p => {
        const date = new Date(p.created_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
        return `✓ ${p.progress_detail}（${date}）`;
      }).join('\n');

      const reviewMsg = `${name}，幫你整理一下你最近提到的變化：\n\n${reviewItems}\n\n這些都是你一餐一餐累積出來的改變。體重只是其中一個指標，但你的身體已經在告訴你：你做對了 ☺️`;

      try {
        await pushMessage(userId, reviewMsg);
        await addChatMessage(userId, 'assistant', reviewMsg);
        await r.set(progressReviewKey, String(newProgressCount), { ex: 86400 * 60 });
        await recordPush(r, userId);
        pushed++;
        log.push({ name, week: courseWeek, type: 'progress-review', items: newProgressCount });
        await logPushHistory(r, name, `進步回顧(${newProgressCount}筆)`, reviewMsg);
        console.log(`[Progress] ${name}: ${newProgressCount} items reviewed`);
      } catch (err) {
        console.error(`[Progress] Failed for ${name}:`, err.message);
      }
      continue; // 推了回顧就不推沉默
    }

    // === 一般沉默推播（帶目標 + 知識題） ===
    const activeGoal = await getActiveGoal(userId);
    const message = getSilentMessage(daysSilent, name, activeGoal?.goal_text, courseWeek);

    try {
      await pushMessage(userId, message);
      // 存入對話紀錄讓 AI 知道推了什麼（學員回覆時 AI 才接得住）
      await addChatMessage(userId, 'assistant', message);
      await recordPush(r, userId);
      pushed++;
      log.push({ name, week: courseWeek, type: daysSilent >= 7 ? 'silent-7d' : 'silent-2d', daysSilent });
      await logPushHistory(r, name, `沉默${daysSilent}天`, message);
      console.log(`[Silent] ${name}: silent=${daysSilent}d (week${courseWeek})`);
    } catch (err) {
      console.error(`[Silent] Failed for ${name}:`, err.message);
    }
  }

  return { pushed, total: users.length, log };
}

// ===================================================================
// 3. 第12週四中午續報提醒（12:15）
// ===================================================================

async function handleRenewalNoonPush(sb, r, users, classMap, now) {
  let pushed = 0;
  const log = [];

  // 安全檢查：只在週四執行
  if (getTaiwanDayOfWeek() !== 4) {
    return { pushed: 0, total: users.length, log: [], note: 'Not Thursday, skipping' };
  }

  for (const user of users) {
    const userId = user.id;
    const name = user.display_name || '同學';
    const classInfo = classMap[user.class_name];
    if (!classInfo?.startDate) continue;

    const startDate = new Date(classInfo.startDate);
    const endDate = classInfo.endDate ? new Date(classInfo.endDate) : null;
    if (now < startDate || (endDate && now > endDate)) continue;

    const courseWeek = calcCourseWeek(classInfo, now);
    if (courseWeek !== 12) continue; // 只推第12週

    const renewalKey = `${RENEWAL_LOG_PREFIX}${userId}:w12`;
    const alreadySent = await r.get(renewalKey);
    if (alreadySent) continue;

    // 今天已推過 → 跳過
    if (await wasPushedToday(r, userId)) continue;

    const msg = getRenewalWeek12Message(name);
    try {
      const qrHint = msg.qr.map(q => `👉 ${q.label}`).join('\n');
      const fullMsg = `${msg.text}\n\n${qrHint}`;
      await pushMessage(userId, fullMsg);
      await addChatMessage(userId, 'assistant', fullMsg);
      await r.set(renewalKey, now.toISOString(), { ex: 86400 * 30 });
      await recordPush(r, userId);
      pushed++;
      log.push({ name, week: courseWeek, type: 'renewal-w12' });
      await logPushHistory(r, name, '續報提醒', msg.text);
      console.log(`[Renewal] ${name}: week12 final reminder`);
    } catch (err) {
      console.error(`[Renewal] Failed for ${name}:`, err.message);
    }
  }

  return { pushed, total: users.length, log };
}

// ===================================================================
// 4. ABC 小挑戰（週六 10:00）
// ===================================================================

const ABC_QUIZ_KEY = (uid) => `coach-abc-quiz:${uid}`;
const ABC_QUIZ_LOG = (uid) => `coach-abc-quiz-log:${uid}`;

const ABC_QUIZZES = {
  1: [
    { id: 'w1a', q: '你知道為什麼要先吃菜嗎？', opts: ['因為菜熱量低吃了不會胖', '纖維會減緩血糖上升，胰島素不用那麼累', '吃菜比較省錢'],
      feedback: '纖維就像緩衝墊，讓後面吃進去的澱粉慢慢被吸收，血糖就不會暴衝。同樣的食物只是換順序，血糖波動就少了 35%！' },
    { id: 'w1b', q: '同一餐食物只是改成「先菜再肉最後飯」，血糖波動大約可以減少多少？', opts: ['5%', '35%', '80%'],
      feedback: 'UCLA 研究發現可以減少 35%！不用少吃任何東西，只是換個順序，胰島素就少加班三分之一。這大概是最簡單、最便宜、馬上能做的一招 💪' },
    { id: 'w1c', q: '晚餐輕碳水的目的是什麼？', opts: ['戒掉澱粉，碳水是壞東西', '讓胰島素早點下班，睡覺時升糖素出來燒脂肪', '餓著才能瘦'],
      feedback: '不是戒澱粉！是讓胰島素晚上能休息。你可以飯量減少，或換成地瓜南瓜，或多吃菜和肉。一休說：「不吃什麼比較難，但增加什麼容易得多」☺️' },
  ],
  2: [
    { id: 'w2a', q: '飯後走路的真正好處是什麼？', opts: ['燃燒大量卡路里', '肌肉在動的時候可以不靠胰島素就直接吸收血糖', '幫助消化不脹氣'],
      feedback: '肌肉就是一塊超大海綿！走路時肌肉自己就會把血糖吸進去，等於幫胰島素開了一條免費通道。吃完飯起來走走就有用 😊' },
    { id: 'w2b', q: '為什麼要練習空腹 10 小時？', opts: ['讓胃休息消化更好', '讓升糖素有機會上班燃燒脂肪', '習慣挨餓就會瘦'],
      feedback: '身體裡有兩個荷爾蒙在輪班：胰島素負責儲存，升糖素負責燃燒。只要一吃東西胰島素就上班，升糖素就下班。空腹 10 小時，是讓升糖素終於有機會去燒脂肪 🔥' },
    { id: 'w2c', q: '含糖飲料的果糖到了肝臟會怎樣？', opts: ['變成能量讓你精神好', '肝臟把糖製造成脂肪，存到肚子上', '直接排出體外'],
      feedback: '一休說：「很多時候我們都是喝胖的。」高果糖糖漿到了肝臟，肝臟會把糖加工成油，直接存到你肚子上 😮' },
  ],
  3: [
    { id: 'w3a', q: '日行 5000 步大約消耗多少大卡？', opts: ['50 大卡', '250～300 大卡', '800 大卡'],
      feedback: '大約 250～300 大卡！不用去健身房，用零碎的時間多走路。原地踏步、走樓梯不搭電梯，都算 😊' },
    { id: 'w3b', q: '前一天不小心吃比較多，隔天最聰明的做法是？', opts: ['整天不吃補回來', '把空腹時間拉長一點，讓身體優先消耗', '瘋狂運動消耗掉'],
      feedback: '不用懲罰自己！空腹時間稍微拉長，身體就會優先使用多吃的熱量。在 10 到 12 小時之間彈性調整就好 ☺️' },
    { id: 'w3c', q: '為什麼外食要優先選「滷燙煮蒸烤」？', opts: ['這樣熱量最低', '高溫油炸產生發炎物質，讓細胞門鎖生鏽，胰島素效率變差', '油炸的都不好吃'],
      feedback: '發炎讓細胞門鎖生鏽，胰島素敲門敲不開，身體就派更多胰島素，越來越容易囤積。炸排骨換成滷排骨，同樣有肉，身體反應差很多！' },
  ],
  4: [
    { id: 'w4a', q: '為什麼喝水可以幫助瘦身？', opts: ['水會沖掉脂肪', '脂肪分解需要水，水不夠代謝跑不動', '喝水可以代替吃飯'],
      feedback: '脂肪分解是化學反應，需要水。水不夠就像水龍頭只開一點洗碗，洗得完但很慢。公式：體重 × 30cc = 每天喝水量 💧' },
    { id: 'w4b', q: '每口咀嚼 20-30 下的目的是什麼？', opts: ['讓食物更好吃', '讓大腦有時間接收飽足感訊號，自然不會吃過量', '讓牙齒更健康'],
      feedback: '大腦需要大約 20 分鐘才能收到「飽了」的訊號。吃太快大腦還沒反應就已經吃超了。慢慢嚼，身體會告訴你什麼時候夠了 ☺️' },
    { id: 'w4c', q: '想吃甜時用水果代替甜點，為什麼比較好？', opts: ['水果完全沒有糖分', '水果有纖維，身體處理起來比精緻糖輕鬆很多', '水果熱量是零'],
      feedback: '水果當然有糖，但有纖維包覆，身體不會像處理精緻糖那樣手忙腳亂。想喝甜的時候吃顆芭樂、一片西瓜，有纖維的糖分身體輕鬆很多 😊' },
  ],
  5: [
    { id: 'w5a', q: '消化 100 大卡的蛋白質，身體要花多少大卡來處理？', opts: ['5～10 大卡', '25～30 大卡', '50 大卡'],
      feedback: '蛋白質的食物熱效應最高！消化 100 大卡蛋白質要花 25～30 大卡，碳水只花 5～10 大卡。所以多吃蛋白質，實際被吸收的熱量更少 💪' },
    { id: 'w5b', q: '吃太快容易胖的真正原因是什麼？', opts: ['嚼不碎消化不良', '飽足訊號從胃到大腦需要 15～20 分鐘，吃太快大腦來不及喊停', '吃太快會吞進太多空氣'],
      feedback: '大腦收到「飽了」的訊號需要 15～20 分鐘。吃太快的人不是特別愛吃，是大腦來不及告訴他「夠了」。8 分飽就好 ☺️' },
    { id: 'w5c', q: '這一週不站上體重計，為什麼？', opts: ['體重計壞了', '體重波動會綁架心情導致放棄，把注意力放在體態和感受', '減重不需要量體重'],
      feedback: '體重一天內可能波動 1～2 公斤（水分、排便、荷爾蒙）。一休說：「體態大於體重，瘦是健康的附加價值。」感受精神好不好、衣服鬆不鬆，比數字更真實 ☺️' },
  ],
  6: [
    { id: 'w6a', q: '睡眠不足的人特別想吃垃圾食物，真正原因是什麼？', opts: ['因為心情不好想安慰自己', '飢餓素飆高讓你特別想吃高糖高油，瘦體素變少感覺不到飽', '因為睡不夠需要更多能量'],
      feedback: '睡不夠會打亂兩個食慾開關：飢餓素飆高（特別想吃垃圾食物）、瘦體素變少（感覺不到飽）。一休說：「不是意志力差，是身體的荷爾蒙在逼你吃。」所以睡好真的很重要！' },
    { id: 'w6b', q: '餅乾、蛋糕、炸薯條有什麼共同點？', opts: ['都很好吃', '都是「糖油混合物」，同時刺激大腦獎勵系統讓你停不下來', '都是碳水化合物'],
      feedback: '糖+油是最容易囤脂+引發發炎的組合。這些食物被食品工程師設計成讓你「一口接一口停不下來」。不是你意志力不夠，是這些食物被設計成讓你無法停下來 😮' },
    { id: 'w6c', q: '日行 7000 步的意義是什麼？', opts: ['走越多瘦越快', '增加非運動活動量（NEAT），長期維持體重的人日常活動量都很高', '為了練腿部肌肉'],
      feedback: '長期維持體重的人不一定有運動習慣，但日常活動量都很高。一休說：「活動比運動更重要——因為活動是整天都在累積的。」7000 步一個月多消耗快一公斤脂肪 😊' },
  ],
  7: [
    { id: 'w7a', q: '天然原型碳水（地瓜、糙米）和精緻碳水（白飯、白麵包）最大的差別是什麼？', opts: ['口感不同', '原型碳水有纖維包著，血糖慢慢升降，不會坐雲霄飛車', '熱量差很多'],
      feedback: '精緻碳水把纖維去掉了，血糖急升急降像坐雲霄飛車，人就又餓又想吃。原型碳水有纖維，血糖穩穩的。一休說：「碳水不是敵人，精緻碳水才是。」' },
    { id: 'w7b', q: '超慢跑要維持的「燃脂心率」大約是多少？', opts: ['每分鐘 60～80 下', '每分鐘 110～130 下', '每分鐘 160 以上'],
      feedback: '110～130 下是脂肪燃燒效率最高的區間。跑太快反而只燒肌肉裡的糖分，不是脂肪。速度大概是「從小烏龜進階到中烏龜」的感覺 🐢' },
    { id: 'w7c', q: '「到超市不主動買零食」這個任務的核心邏輯是什麼？', opts: ['省錢', '改變環境比靠意志力有效——家裡沒零食就不會吃', '零食都不健康'],
      feedback: '一休說：「環境會影響行為。改變環境，行為就會跟著改變。」家裡沒零食就不會邊看電視邊吃。拒絕最好的方式就是不讓自己有機會面對誘惑 😊' },
  ],
  8: [
    { id: 'w8a', q: 'Omega-3（堅果裡的好油）對減重有什麼幫助？', opts: ['直接燃燒脂肪', '幫細胞的門鎖除鏽（抗發炎），讓胰島素效率回升', '增加飽足感而已'],
      feedback: '一休的比喻：Omega-3 就是幫門鎖除鏽的東西。發炎讓細胞聽不見胰島素的話，好油脂幫助消炎，胰島素效率回升，身體就不會一直囤積 ☺️ 記得買「無調味」堅果！' },
    { id: 'w8b', q: '睡前 2 小時不吃東西，為什麼能幫助燃脂？', opts: ['餓著睡覺消耗更多', '胰島素下班，升糖素上班，睡覺時身體在燒脂肪', '這樣隔天早上比較餓會吃更多'],
      feedback: '一休說：「睡著也在燃脂。」睡前不吃 → 胰島素下班 → 升糖素上班開始燒脂肪。睡覺的 7～8 小時如果胰島素在休息，等於整晚都在燃脂模式 🔥' },
    { id: 'w8c', q: '為什麼「調味堅果」反而不好？', opts: ['調味堅果比較貴', '調味堅果加了大量糖鹽油，反而增加熱量和發炎', '調味堅果營養被破壞了'],
      feedback: '堅果本身是好油脂，但調味堅果加了大量糖、鹽、油。原本幫你消炎的好東西，加了這些反而讓身體更發炎。買堅果一定要選「無調味」的 ☺️' },
  ],
  9: [
    { id: 'w9a', q: '全身的血糖有多少比例是被肌肉消耗掉的？', opts: ['30%', '50%', '80%'],
      feedback: '整整 80%！肌肉就是一塊超大的血糖海綿。肌肉量越多，能消耗的血糖越多，吃進來的碳水有地方存就不會變成脂肪。所以深蹲不只是練腿，是在擴充你的血糖容量 💪' },
    { id: 'w9b', q: '有氧運動大約持續多久之後，身體才會切換到以脂肪為主要燃料？', opts: ['一開始就在燒脂肪', '10～15 分鐘後', '至少 1 小時後'],
      feedback: '前幾分鐘主要燒肌肉裡的糖，10～15 分鐘後逐漸切換到脂肪。所以超慢跑從 10 分鐘延長到 20 分鐘，多出的 10 分鐘正好是脂肪燃燒效率最高的時段 🔥' },
    { id: 'w9c', q: '為什麼飯後是深蹲的最佳時機？', opts: ['飯後比較有力氣', '血糖正在上升，肌肉可以直接消耗掉，胰島素就不用那麼辛苦', '飯後不容易受傷'],
      feedback: '飯後血糖正在升高，這時候做深蹲，肌肉直接把血糖吸走，胰島素就不用緊急出動。一休的方法：每上一次廁所蹲 10 下，一天 3 次就 30 下 😊' },
  ],
  10: [
    { id: 'w10a', q: '覺得「餓了」的時候，有可能其實只是什麼？', opts: ['想睡覺', '缺水', '缺乏運動'],
      feedback: '很多時候覺得餓其實只是缺水！水也是天然的食慾調節器。好策略：每餐前 10 分鐘喝 500cc，三餐就 1500cc，加上零碎時間很容易達標 💧' },
    { id: 'w10b', q: '飯後馬上坐著不動，身體會怎樣？', opts: ['幫助消化', '胰島素把熱量存成脂肪，因為肌肉沒有在消耗', '沒有影響'],
      feedback: '飯後血糖最高，馬上坐著不動，胰島素只能把熱量存成脂肪。但只要站起來走走，肌肉就會不靠胰島素自己吸收血糖。一天三餐各走 10 分鐘就很棒了 😊' },
    { id: 'w10c', q: '缺水時血液會怎樣影響胰島素？', opts: ['沒有影響', '血液變濃稠，血糖濃度相對上升，胰島素得多分泌', '胰島素會變少'],
      feedback: '缺水 → 血液變濃稠 → 血糖濃度相對升高 → 胰島素被迫多分泌。所以喝水不只是為了解渴，是幫身體的代謝系統順暢運作。一休說：「水是機器的潤滑油」💧' },
  ],
  11: [
    { id: 'w11a', q: '一休說復胖惡性循環的起點是什麼？', opts: ['吃太多', '不運動', '「我不喜歡自己」這個念頭'],
      feedback: '一休說：「那個循環的起點不是食物——是我不喜歡自己。」不喜歡自己 → 暴食放棄 → 更討厭自己。反過來，開始肯定自己 → 覺得「我值得對自己好」→ 自然做出好選擇 ☺️' },
    { id: 'w11b', q: '持續吃天然水果代替甜點一段時間後，會發生什麼？', opts: ['會越來越想吃甜的', '味覺重置——水果的天然甜變得更明顯，反而覺得以前的甜點太甜', '對甜味完全無感'],
      feedback: '味覺會重置！持續選天然水果，你的味蕾會重新變敏感。很多學員說：「以前覺得珍奶好喝，現在覺得太甜了。」這不是忍耐，是身體真的改變了 😊' },
    { id: 'w11c', q: '深蹲從 30 下進階到 40 下，除了練肌肉還在練什麼？', opts: ['練耐力', '練「我可以比昨天多做一點」的信心', '練平衡感'],
      feedback: '一休說：「深蹲不只是在練肌肉，更是在練『我可以比昨天多做一點』的信心。」每多做 10 下都是在幫身體升級引擎，也在幫自己建立「我做得到」的確定感 💪' },
  ],
  12: [
    { id: 'w12a', q: '喝酒為什麼特別容易胖？', opts: ['酒精熱量很高', '肝臟忙著排酒精時燃脂暫停＋酒精提高飢餓荷爾蒙讓你狂吃下酒菜', '酒精讓你多喝水'],
      feedback: '酒精有四大代謝危害：①肝臟排酒精時燃脂暫停 ②1克酒精=7大卡接近脂肪 ③提高飢餓荷爾蒙狂吃下酒菜 ④促進發炎。一休說：「喝酒等於喝油。」啤酒肚是真的 😮' },
    { id: 'w12b', q: '空腹超過 12 小時後，身體會啟動什麼機制？', opts: ['開始分解肌肉', '細胞清理機制——像幫房間做大掃除', '停止所有代謝'],
      feedback: '身體會啟動更深層的「細胞清理機制」，清理老舊廢物，像幫房間做大掃除。但空腹不是可以大吃大喝不會胖，要靈活調整：大餐後拉長、平常 12 小時就夠好 ☺️' },
    { id: 'w12c', q: '一休說 ABC 課程最重要的目的是什麼？', opts: ['讓你瘦到理想體重', '讓你學會一套方法，不用一輩子把時間花在減重上', '讓你戒掉所有不健康的食物'],
      feedback: '一休說：「人生真的不需要一輩子把時間都花在減重上面。用三個月學會這件事，然後把剩下的人生拿去做你真正想做的事。」瘦是健康的附加價值，拿回人生的自主權才是真正的目標 ☺️' },
  ],
};

async function handleAbcQuizPush(sb, r, users, classMap, now) {
  let pushed = 0;
  const log = [];

  for (const user of users) {
    const userId = user.id;
    const name = user.display_name || '同學';
    const classInfo = classMap[user.class_name];
    if (!classInfo?.startDate) continue;

    const startDate = new Date(classInfo.startDate);
    const endDate = classInfo.endDate ? new Date(classInfo.endDate) : null;
    if (now < startDate || (endDate && now > endDate)) continue;

    const courseWeek = calcCourseWeek(classInfo, now);
    if (courseWeek < 1 || courseWeek > 12) continue;

    // 防重複：今天已推過就跳過（防止超時重推）
    if (await wasPushedToday(r, userId)) continue;

    const quizWeek = Math.min(courseWeek, 12);
    const weekQuizzes = ABC_QUIZZES[quizWeek];
    if (!weekQuizzes) continue;

    // 隨機出題（一週 3 題，偶爾重複也 OK）
    const quiz = weekQuizzes[Math.floor(Math.random() * weekQuizzes.length)];

    const optsText = quiz.opts.map((o, i) => `${i + 1}. ${o}`).join('\n');
    const message = `${name}，週末小挑戰來了 😄\n\n${quiz.q}\n\n${optsText}\n\n回覆數字就好 😊`;

    try {
      // 先記錄推播（防止超時重推時重複送）
      await recordPush(r, userId);
      const pushPromise = pushMessage(userId, message);
      const chatPromise = addChatMessage(userId, 'assistant', message);
      const quizPromise = r.set(ABC_QUIZ_KEY(userId), JSON.stringify(quiz), { ex: 86400 * 3 })
      await Promise.all([pushPromise, chatPromise, quizPromise]);
      pushed++;
      log.push({ name, week: courseWeek, quizWeek, quizId: quiz.id });
      await logPushHistory(r, name, `ABC小挑戰W${quizWeek}`, quiz.q);
      console.log(`[ABCQuiz] ${name}: week${courseWeek} quiz=${quiz.id}`);
    } catch (err) {
      console.error(`[ABCQuiz] Failed for ${name}:`, err.message);
    }
  }

  return { pushed, total: users.length, log };
}
