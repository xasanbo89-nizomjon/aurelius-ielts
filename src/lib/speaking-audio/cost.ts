/**
 * Phase Q-B - what one assessment costs, as an ESTIMATE from the usage the API reports (tokens, audio seconds) and list prices kept here. Pure.
 *
 * Prices are US dollars per million tokens (text, audio) and per minute of transcription. They are the list prices at the time of writing; the Root Teacher's usage page
 * says "estimate" and shows the model names, and `SPEAKING_PRICES_JSON` (an object shaped like PRICES below) overrides them without a deploy when the prices change.
 */

export type AssessModelPrice = { textInPerMillion: number; audioInPerMillion: number; textOutPerMillion: number };

const TRANSCRIBE_PER_MINUTE: Record<string, number> = {
  "gpt-4o-mini-transcribe": 0.003,
  "gpt-4o-transcribe": 0.006,
  "whisper-1": 0.006,
};

const ASSESS: Record<string, AssessModelPrice> = {
  "gpt-audio-mini": { textInPerMillion: 0.6, audioInPerMillion: 10, textOutPerMillion: 2.4 },
  "gpt-audio": { textInPerMillion: 2.5, audioInPerMillion: 32, textOutPerMillion: 10 },
  "gpt-4o-mini": { textInPerMillion: 0.15, audioInPerMillion: 0, textOutPerMillion: 0.6 },
};
const FALLBACK_ASSESS: AssessModelPrice = ASSESS["gpt-audio"];
const FALLBACK_TRANSCRIBE = 0.006;

type PriceOverrides = { transcribePerMinute?: Record<string, number>; assess?: Record<string, Partial<AssessModelPrice>> };

function overrides(): PriceOverrides {
  const raw = typeof process !== "undefined" ? process.env.SPEAKING_PRICES_JSON : undefined;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as PriceOverrides;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function transcribePricePerMinute(model: string): number {
  return overrides().transcribePerMinute?.[model] ?? TRANSCRIBE_PER_MINUTE[model] ?? FALLBACK_TRANSCRIBE;
}

export function assessPrice(model: string): AssessModelPrice {
  return { ...(ASSESS[model] ?? FALLBACK_ASSESS), ...(overrides().assess?.[model] ?? {}) };
}

/** Dollars for one transcription of `seconds` of speech. */
export function transcriptionCostUsd(model: string, seconds: number): number {
  return (Math.max(0, seconds) / 60) * transcribePricePerMinute(model);
}

/** Dollars for one assessment call from the usage the API reported (`audioInputTokens` is the audio part of the prompt tokens). */
export function assessmentCostUsd(model: string, usage: { promptTokens: number; audioInputTokens: number; completionTokens: number }): number {
  const price = assessPrice(model);
  const audio = Math.min(usage.audioInputTokens, usage.promptTokens);
  const text = Math.max(0, usage.promptTokens - audio);
  return (text * price.textInPerMillion + audio * price.audioInPerMillion + usage.completionTokens * price.textOutPerMillion) / 1_000_000;
}

/** Stored as whole millionths of a dollar so sums stay exact. */
export const toMicroUsd = (usd: number): number => Math.max(0, Math.round(usd * 1_000_000));
export const fromMicroUsd = (micro: number): number => micro / 1_000_000;

/** "$0.042" for a single assessment, "$12.30" for a month: three decimals under a dollar, two above. */
export function formatUsd(usd: number): string {
  return usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}
