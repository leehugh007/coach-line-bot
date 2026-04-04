/**
 * API 花費追蹤模組 — 休校長小幫手
 *
 * 寫入共用的 abc_api_usage 表，用 bot='coach' 區分
 */

import { getSupabase } from './supabase.js';

// API 定價（TWD per 1M tokens）
// Gemini：https://ai.google.dev/gemini-api/docs/pricing（2026-03-28 查證）
// Claude：https://www.anthropic.com/pricing（2026-03-29 查證）
// USD × 匯率 32
const PRICING = {
  'gemini-3-flash-preview': {
    input: 16, output: 96, thinking: 96,       // $0.50 / $3.00
  },
  'gemini-3.1-flash-lite-preview': {
    input: 8, output: 48, thinking: 48,         // $0.25 / $1.50
  },
  'gemini-2.5-flash-lite': {
    input: 3.2, output: 12.8, thinking: 12.8,   // $0.10 / $0.40
  },
  'gemini-2.5-flash': {
    input: 9.6, output: 80, thinking: 80,       // $0.30 / $2.50
  },
  'claude-haiku-4.5': {
    input: 32, output: 160, thinking: 160,     // $1.00 / $5.00
  },
};

function extractUsageMetadata(data) {
  const usage = data?.usageMetadata;
  if (!usage) return null;
  return {
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    thinkingTokens: usage.thoughtsTokenCount || 0,
    totalTokens: usage.totalTokenCount || 0,
    cachedTokens: usage.cachedContentTokenCount || 0,
  };
}

function calculateCostTwd(model, usage) {
  const pricing = PRICING[model] || PRICING['gemini-3.1-flash-lite-preview'];
  // cached tokens 打 25 折（Gemini Context Caching 定價）
  const nonCachedInput = usage.inputTokens - (usage.cachedTokens || 0);
  const cachedInput = usage.cachedTokens || 0;
  return (
    (nonCachedInput * pricing.input +
      cachedInput * pricing.input * 0.25 +
      usage.outputTokens * pricing.output +
      usage.thinkingTokens * pricing.thinking) / 1_000_000
  );
}

/**
 * 記錄一次 API call 的花費（非阻塞）
 *
 * @param {string} userId - LINE user ID
 * @param {string} callType - 'private_reply' | 'group_detect' | 'group_draft' | 'intent_classify'
 * @param {string} model - Gemini model name
 * @param {object} responseData - Gemini API 完整 response JSON
 */
export function trackApiUsage(userId, callType, model, responseData) {
  try {
    const usage = extractUsageMetadata(responseData);
    if (!usage) return;

    const costTwd = calculateCostTwd(model, usage);

    const cachedInfo = usage.cachedTokens > 0 ? ` cached:${usage.cachedTokens}` : '';
    console.log(
      `[CostTracker] ${callType} | ${model} | in:${usage.inputTokens}${cachedInfo} out:${usage.outputTokens} think:${usage.thinkingTokens} | ≈${costTwd.toFixed(4)} TWD`
    );

    const supabase = getSupabase();
    if (!supabase) return;

    supabase
      .from('abc_api_usage')
      .insert({
        user_id: userId || 'system',
        call_type: callType,
        model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        thinking_tokens: usage.thinkingTokens,
        total_tokens: usage.totalTokens,
        cached_tokens: usage.cachedTokens,
        cost_twd: costTwd,
        bot: 'coach',
      })
      .then(({ error }) => {
        if (error) console.error('[CostTracker] Insert error:', error.message);
      })
      .catch(err => console.error('[CostTracker] Promise rejected:', err.message));
  } catch (err) {
    console.error('[CostTracker] Error:', err.message);
  }
}
