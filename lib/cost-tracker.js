/**
 * API 花費追蹤模組 — 休校長小幫手
 *
 * 寫入共用的 abc_api_usage 表，用 bot='coach' 區分
 */

import { getSupabase } from './supabase.js';

// Gemini 定價（TWD per 1M tokens）
// 來源：https://ai.google.dev/gemini-api/docs/pricing（2026-03-26 查證）
// ⚠️ 同步更新：abc-line-bot/lib/cost-tracker.js（兩份一模一樣）
const PRICING = {
  'gemini-3-flash-preview': {
    input: 16, output: 96, thinking: 96,
  },
  'gemini-3.1-flash-lite-preview': {
    input: 8, output: 48, thinking: 48,
  },
  'gemini-2.5-flash-lite': {
    input: 3.2, output: 12.8, thinking: 12.8,
  },
  'gemini-2.5-flash': {
    input: 9.6, output: 80, thinking: 22.4,
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
  };
}

function calculateCostTwd(model, usage) {
  const pricing = PRICING[model] || PRICING['gemini-3.1-flash-lite-preview'];
  return (
    (usage.inputTokens * pricing.input +
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

    console.log(
      `[CostTracker] ${callType} | ${model} | in:${usage.inputTokens} out:${usage.outputTokens} think:${usage.thinkingTokens} | ≈${costTwd.toFixed(4)} TWD`
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
        cost_twd: costTwd,
        bot: 'coach',
      })
      .then(({ error }) => {
        if (error) console.error('[CostTracker] Insert error:', error.message);
      });
  } catch (err) {
    console.error('[CostTracker] Error:', err.message);
  }
}
