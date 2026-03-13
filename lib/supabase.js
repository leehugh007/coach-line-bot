/**
 * Supabase 客戶端單例
 *
 * 用途：永久儲存用戶資料、對話紀錄、教練標籤、里程碑
 * Redis 仍為主要讀取快取，Supabase 為持久層
 */

import { createClient } from '@supabase/supabase-js';

let supabase;

export function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    if (!url || !key) {
      console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_KEY, persistence disabled');
      return null;
    }

    supabase = createClient(url, key);
  }
  return supabase;
}
