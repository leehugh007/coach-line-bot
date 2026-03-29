/**
 * 健康檢查 endpoint
 * GET /api/health?secret=coach-debug-2025
 *
 * 檢查：Redis / Supabase / Gemini API
 */

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getSupabase } from '@/lib/supabase';

const ADMIN_SECRET = process.env.ADMIN_API_KEY || 'coach-debug-2025';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isManual = secret === ADMIN_SECRET;
  if (!isCron && !isManual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    timestamp: new Date().toISOString(),
    redis: { ok: false },
    supabase: { ok: false },
    gemini: { ok: false },
    overall: false,
  };

  // 1. Redis
  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    const pong = await redis.ping();
    results.redis = { ok: pong === 'PONG', response: pong };
  } catch (err) {
    results.redis = { ok: false, error: err.message };
  }

  // 2. Supabase
  try {
    const sb = getSupabase();
    if (!sb) {
      results.supabase = { ok: false, error: 'No credentials' };
    } else {
      const { data, error } = await sb.from('users').select('id').limit(1);
      if (error) {
        results.supabase = { ok: false, error: error.message };
      } else {
        results.supabase = { ok: true, rows: data?.length || 0 };
      }
    }
  } catch (err) {
    results.supabase = { ok: false, error: err.message };
  }

  // 3. Gemini API
  try {
    const key = process.env.GEMINI_API_KEY;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }
    );
    results.gemini = { ok: res.ok, status: res.status };
  } catch (err) {
    results.gemini = { ok: false, error: err.message };
  }

  results.overall = results.redis.ok && results.supabase.ok && results.gemini.ok;

  return NextResponse.json(results, { status: results.overall ? 200 : 503 });
}
