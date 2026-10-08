export { formatUsd, fromMicroUsd, toMicroUsd } from "@/lib/speaking-audio/cost";
import { toMicroUsd } from "@/lib/speaking-audio/cost";

/**
 * Phase O - what one AI call of a Writing assessment costs, as an ESTIMATE from the token counts the API reports and the list prices kept here (US dollars per million
 * tokens). The Root Teacher's usage page calls it an estimate and shows the model names; `WRITING_PRICES_JSON` (an object like
 * {"gpt-4o": {"inPerMillion": 2.5, "outPerMillion": 10}}) overrides the table without a deploy when the prices change. The picture of Task 1 is part of the prompt tokens.
 */

export type WritingModelPrice = { inPerMillion: number; outPerMillion: number };

const PRICES: Record<string, WritingModelPrice> = {
  "gpt-4o-mini": { inPerMillion: 0.15, outPerMillion: 0.6 },
  "gpt-4o": { inPerMillion: 2.5, outPerMillion: 10 },
  "gpt-4.1-nano": { inPerMillion: 0.1, outPerMillion: 0.4 },
  "gpt-4.1-mini": { inPerMillion: 0.4, outPerMillion: 1.6 },
  "gpt-4.1": { inPerMillion: 2, outPerMillion: 8 },
  "gpt-5-mini": { inPerMillion: 0.25, outPerMillion: 2 },
  "gpt-5": { inPerMillion: 1.25, outPerMillion: 10 },
};
/** A model that is not in the table is priced like gpt-4o: the estimate errs on the high side. */
const FALLBACK: WritingModelPrice = PRICES["gpt-4o"];

function overrides(): Record<string, Partial<WritingModelPrice>> {
  const raw = typeof process !== "undefined" ? process.env.WRITING_PRICES_JSON : undefined;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<WritingModelPrice>>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function writingPrice(model: string): WritingModelPrice {
  const base = PRICES[model] ?? Object.entries(PRICES).find(([name]) => model.startsWith(`${name}-`))?.[1] ?? FALLBACK;
  return { ...base, ...(overrides()[model] ?? {}) };
}

/** Dollars for one call from the usage the API reported. */
export function writingCallCostUsd(model: string, usage: { promptTokens: number; completionTokens: number }): number {
  const price = writingPrice(model);
  return (Math.max(0, usage.promptTokens) * price.inPerMillion + Math.max(0, usage.completionTokens) * price.outPerMillion) / 1_000_000;
}

export const writingCallCostMicro = (model: string, usage: { promptTokens: number; completionTokens: number }): number => toMicroUsd(writingCallCostUsd(model, usage));
