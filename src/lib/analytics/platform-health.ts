import "server-only";

import { prisma } from "@/lib/prisma";
import { summarizeAllMetrics, summarizeMetricsByPrefix, summarizeAiTokenUsage, type MetricSummary, type AiTokenSummary } from "@/lib/monitoring/metrics-store";

export type CacheHitRate = { source: string; hits: number; misses: number; hitRatePercent: number | null };

/**
 * Phase 29 — Part 11, Platform Health Monitor (root-only, internal).
 * "Cache performance" reads the real `servedFromCache` flag every AI
 * action already logs (Explain More, Writing AI, Vocabulary AI) — genuine
 * hit/miss counts from real request logs, not a simulated ratio.
 */
export async function getCacheHitRates(): Promise<CacheHitRate[]> {
  const [explanations, writingActions, vocabularyActions] = await Promise.all([
    prisma.aiExplanationRequest.groupBy({ by: ["servedFromCache"], _count: { _all: true } }),
    prisma.writingAiActionLog.groupBy({ by: ["servedFromCache"], _count: { _all: true } }),
    prisma.vocabularyAiActionLog.groupBy({ by: ["servedFromCache"], _count: { _all: true } }),
  ]);

  function toRate(source: string, grouped: { servedFromCache: boolean; _count: { _all: number } }[]): CacheHitRate {
    const hits = grouped.find((g) => g.servedFromCache)?._count._all ?? 0;
    const misses = grouped.find((g) => !g.servedFromCache)?._count._all ?? 0;
    const total = hits + misses;
    return { source, hits, misses, hitRatePercent: total > 0 ? Math.round((hits / total) * 100) : null };
  }

  return [
    toRate("Explain More", explanations),
    toRate("Writing AI", writingActions),
    toRate("Vocabulary AI", vocabularyActions),
  ];
}

export type PlatformHealthSnapshot = {
  dbMetrics: MetricSummary[];
  aiMetrics: MetricSummary[];
  aiTokenUsage: AiTokenSummary[];
  cacheHitRates: CacheHitRate[];
};

/**
 * All in-process metrics are real and live, but reset on every server
 * restart/redeploy and are scoped to whichever single instance served this
 * request — an honest limitation for a serverless/multi-instance
 * deployment, not a bug. Cache hit rates come from real DB rows instead,
 * so they stay accurate across restarts.
 */
export async function getPlatformHealthSnapshot(): Promise<PlatformHealthSnapshot> {
  const cacheHitRates = await getCacheHitRates();

  return {
    dbMetrics: summarizeMetricsByPrefix("db:"),
    aiMetrics: summarizeMetricsByPrefix("ai:"),
    aiTokenUsage: summarizeAiTokenUsage(),
    cacheHitRates,
  };
}

export { summarizeAllMetrics };
