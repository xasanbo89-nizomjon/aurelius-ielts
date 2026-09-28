import "server-only";

/**
 * Phase 29 — Part 11, Platform Health Monitor. A minimal, real, in-process
 * metrics recorder — explicitly NOT durable: it's a single Node process's
 * in-memory ring buffer, reset on every restart/redeploy and never shared
 * across serverless instances (same honest limitation as Phase 28's
 * device-registration scaffold). "No external services" is satisfied by
 * construction: nothing here ever leaves the process.
 */
const MAX_SAMPLES_PER_KEY = 500;

type Sample = { durationMs: number; success: boolean; at: number };

const buckets = new Map<string, Sample[]>();

export function recordMetric(key: string, durationMs: number, success = true): void {
  const samples = buckets.get(key) ?? [];
  samples.push({ durationMs, success, at: Date.now() });
  if (samples.length > MAX_SAMPLES_PER_KEY) samples.shift();
  buckets.set(key, samples);
}

export async function measureAsync<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    recordMetric(key, performance.now() - start, true);
    return result;
  } catch (error) {
    recordMetric(key, performance.now() - start, false);
    throw error;
  }
}

export type MetricSummary = {
  key: string;
  count: number;
  avgMs: number;
  p95Ms: number;
  failureCount: number;
  failureRatePercent: number;
  lastRecordedAt: Date | null;
};

export function summarizeMetric(key: string): MetricSummary | null {
  const samples = buckets.get(key);
  if (!samples || samples.length === 0) return null;

  const durations = [...samples.map((s) => s.durationMs)].sort((a, b) => a - b);
  const avgMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const p95Index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
  const failureCount = samples.filter((s) => !s.success).length;
  const lastRecordedAt = samples.length > 0 ? new Date(samples[samples.length - 1].at) : null;

  return {
    key,
    count: samples.length,
    avgMs,
    p95Ms: Math.round(durations[p95Index]),
    failureCount,
    failureRatePercent: Math.round((failureCount / samples.length) * 100),
    lastRecordedAt,
  };
}

export function summarizeMetricsByPrefix(prefix: string): MetricSummary[] {
  return [...buckets.keys()]
    .filter((key) => key.startsWith(prefix))
    .map((key) => summarizeMetric(key))
    .filter((s): s is MetricSummary => s != null);
}

export function summarizeAllMetrics(): MetricSummary[] {
  return [...buckets.keys()]
    .map((key) => summarizeMetric(key))
    .filter((s): s is MetricSummary => s != null);
}

// --- OpenAI token usage — a separate counter, since tokens aren't a duration ---

type TokenTotals = { promptTokens: number; completionTokens: number; calls: number };
const tokenTotals = new Map<string, TokenTotals>();

export function recordAiTokenUsage(schemaName: string, promptTokens: number, completionTokens: number): void {
  const existing = tokenTotals.get(schemaName) ?? { promptTokens: 0, completionTokens: 0, calls: 0 };
  existing.promptTokens += promptTokens;
  existing.completionTokens += completionTokens;
  existing.calls += 1;
  tokenTotals.set(schemaName, existing);
}

export type AiTokenSummary = { schemaName: string; calls: number; promptTokens: number; completionTokens: number; totalTokens: number };

export function summarizeAiTokenUsage(): AiTokenSummary[] {
  return [...tokenTotals.entries()].map(([schemaName, totals]) => ({
    schemaName,
    calls: totals.calls,
    promptTokens: totals.promptTokens,
    completionTokens: totals.completionTokens,
    totalTokens: totals.promptTokens + totals.completionTokens,
  }));
}

// --- Recent errors — Phase 31, Part 5 (real, in-memory, same honest non-durability as everything else in this file) ---

const MAX_RECENT_ERRORS = 100;

export type RecordedError = { context: string; message: string; digest: string | null; at: number };

const recentErrors: RecordedError[] = [];

export function recordError(context: string, message: string, digest: string | null = null): void {
  recentErrors.push({ context, message, digest, at: Date.now() });
  if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift();
}

export function listRecentErrors(limit = 20): RecordedError[] {
  return recentErrors.slice(-limit).reverse();
}

export function countRecentErrors(sinceMs: number): number {
  const cutoff = Date.now() - sinceMs;
  return recentErrors.filter((e) => e.at >= cutoff).length;
}
