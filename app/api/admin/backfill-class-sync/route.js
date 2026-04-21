/**
 * Admin API — 一次性 backfill：修 Redis profile 跟 Supabase class_name 不一致 + 回寫 preload.matched
 *
 * 背景：
 * - batchImportIntros auto-reassign 舊版寫 Redis `profile.class_name`（snake_case），
 *   但 route.js L1129 讀 `profile.className`（camelCase）→ 舊 camelCase 殘留致學員被判 expired
 * - auto-reassign 命中也沒回寫 preload.matched → staff 畫面永遠顯示「等待加好友」
 * - 本 API 把歷史髒資料一次修好
 *
 * POST /api/admin/backfill-class-sync[?dry=1]
 * Header: x-admin-key = ADMIN_API_KEY
 */

import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// 140 users + ~500 preloads 序列 await 約 90 秒，Vercel 預設 timeout 不夠
export const maxDuration = 300;

const ADMIN_KEY = process.env.ADMIN_API_KEY;
const STAFF_KEY = process.env.STAFF_API_KEY;

// 跟 /api/admin/import 一致：同時接受 admin / staff key
function checkAuth(request) {
  const key = request.headers.get('x-admin-key') || request.headers.get('x-staff-key');
  if (ADMIN_KEY && key === ADMIN_KEY) return true;
  if (STAFF_KEY && key === STAFF_KEY) return true;
  return false;
}

function getRedisClient() {
  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

// 正規化名稱（跟 lib/user.js 的 normalizeName 行為一致）
function normalizeName(name) {
  if (!name) return null;
  return String(name).trim().toLowerCase().replace(/\s+/g, '');
}

export async function POST(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dry = url.searchParams.get('dry') === '1';

  const r = getRedisClient();
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const report = {
    dry,
    profileFixed: [],      // Redis profile 修正的 user
    profileOk: 0,          // profile 已正確
    profileMissing: 0,     // Redis profile 不存在（read-through 會重建）
    preloadMatched: [],    // preload.matched 回寫的
    preloadAlreadyOk: 0,
    preloadNoUser: 0,      // preload 名單但 Supabase 找不到對應 user
    errors: [],
  };

  try {
    // === Step 1：掃 Supabase users，修 Redis profile 不一致 ===
    const { data: users, error: usersErr } = await sb
      .from('users')
      .select('id, class_name, display_name, renewal_intent, renewal_confirmed_at')
      .not('class_name', 'is', null);

    if (usersErr) {
      return NextResponse.json({ error: 'Fetch users failed', detail: usersErr.message }, { status: 500 });
    }

    for (const user of (users || [])) {
      try {
        const redisKey = `coach-user:${user.id}`;
        const cached = await r.get(redisKey);

        if (!cached || typeof cached !== 'object') {
          report.profileMissing++;
          continue;
        }

        const dbClass = user.class_name;
        const profileClassName = cached.className || null;
        const profileClassSnake = cached.class_name || null;
        const hasStaleSnake = profileClassSnake != null;
        const classMismatch = profileClassName !== dbClass;

        if (classMismatch || hasStaleSnake) {
          report.profileFixed.push({
            userId: user.id,
            displayName: user.display_name,
            before: { className: profileClassName, class_name: profileClassSnake },
            after: { className: dbClass, class_name: null },
          });

          if (!dry) {
            cached.className = dbClass;
            if (hasStaleSnake) delete cached.class_name;
            await r.set(redisKey, cached);
          }
        } else {
          report.profileOk++;
        }
      } catch (e) {
        report.errors.push({ step: 'profile', userId: user.id, error: e.message });
      }
    }

    // === Step 2：掃 preload 名單，回寫 matched ===
    const allPreloadNames = await r.smembers('coach-preload:__index');

    for (const normalizedName of (allPreloadNames || [])) {
      try {
        const preloadKey = `coach-preload:${normalizedName}`;
        const preloadRecord = await r.get(preloadKey);

        if (!preloadRecord || typeof preloadRecord !== 'object') continue;
        if (preloadRecord.matched) {
          report.preloadAlreadyOk++;
          continue;
        }

        // 用 lineName / realName 比對 users 表
        const namesToMatch = [preloadRecord.lineName];
        if (preloadRecord.realName) namesToMatch.push(preloadRecord.realName);

        let foundUserId = null;
        for (const name of namesToMatch) {
          if (!name) continue;
          const { data: existing } = await sb.from('users')
            .select('id, display_name')
            .eq('display_name', name)
            .limit(1);
          if (existing && existing.length > 0) {
            foundUserId = existing[0].id;
            break;
          }
        }

        if (!foundUserId) {
          report.preloadNoUser++;
          continue;
        }

        report.preloadMatched.push({
          normalizedName,
          lineName: preloadRecord.lineName,
          realName: preloadRecord.realName,
          className: preloadRecord.className,
          matchedUserId: foundUserId,
        });

        if (!dry) {
          preloadRecord.matched = true;
          preloadRecord.matchedUserId = foundUserId;
          preloadRecord.matchedAt = new Date().toISOString();
          await r.set(preloadKey, preloadRecord);

          // realName 索引也同步
          if (preloadRecord.realName) {
            const normalizedReal = normalizeName(preloadRecord.realName);
            if (normalizedReal) {
              const realKey = `coach-preload-name:${normalizedReal}`;
              const realRecord = await r.get(realKey);
              if (realRecord && typeof realRecord === 'object' && !realRecord.matched) {
                realRecord.matched = true;
                realRecord.matchedUserId = foundUserId;
                realRecord.matchedAt = new Date().toISOString();
                await r.set(realKey, realRecord);
              }
            }
          }
        }
      } catch (e) {
        report.errors.push({ step: 'preload', normalizedName, error: e.message });
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        dry,
        profileTotalChecked: users?.length || 0,
        profileFixed: report.profileFixed.length,
        profileOk: report.profileOk,
        profileMissing: report.profileMissing,
        preloadTotalChecked: allPreloadNames?.length || 0,
        preloadMatched: report.preloadMatched.length,
        preloadAlreadyOk: report.preloadAlreadyOk,
        preloadNoUser: report.preloadNoUser,
        errors: report.errors.length,
      },
      detail: report,
    });

  } catch (err) {
    console.error('[Backfill] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    );
  }
}
