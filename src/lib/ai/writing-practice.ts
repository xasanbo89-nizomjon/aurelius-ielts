import "server-only";

import { prisma } from "@/lib/prisma";
import { getOrGenerateRecommendation, assertWithinRateLimit } from "@/lib/ai/writing";
import { generateWritingPractice } from "@/lib/ai/services/writing-practice";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { getOpenAIModel } from "@/lib/ai/openai";

export type PracticeItem = { sentence: string; answer: string };

export type PracticeResult =
  | { success: true; weaknessArea: string; instructions: string; items: PracticeItem[]; cached: boolean }
  | { success: false; code: "NOT_ENOUGH_DATA" | "RATE_LIMITED" | "UNAVAILABLE"; error: string };

const RECENT_WEAKNESS_LIMIT = 8;

function toItems(raw: unknown): PracticeItem[] {
  return Array.isArray(raw) ? (raw as PracticeItem[]) : [];
}

/**
 * Practice Mode (Phase 14, section 10). Deliberately piggybacks on the same
 * weakest-area signal as the Phase 13 AI Recommendation (WritingFeedback)
 * rather than running a second, redundant weakness-detection pass — Practice
 * Mode is literally "give me a drill for my weakest area". Real caching:
 * only regenerates when the weakest area changes or genuinely new analyzed
 * submissions exist since basedOnSubmissionCount was last computed.
 */
export async function getOrGeneratePractice(studentId: string, teacherId: string | null): Promise<PracticeResult> {
  const recommendation = await getOrGenerateRecommendation(studentId, teacherId);
  if (!recommendation.success) {
    return { success: false, code: recommendation.code, error: recommendation.error };
  }

  const totalAnalyzedNow = await prisma.writingSubmission.count({
    where: { studentId, status: { not: "DRAFT" }, analysis: { isNot: null } },
  });

  const existing = await prisma.writingPractice.findUnique({ where: { studentId } });
  if (existing && existing.weaknessArea === recommendation.weakestArea && existing.basedOnSubmissionCount >= totalAnalyzedNow) {
    return { success: true, weaknessArea: existing.weaknessArea, instructions: existing.instructions, items: toItems(existing.items), cached: true };
  }

  const rateCheck = await assertWithinRateLimit(studentId, teacherId);
  if (!rateCheck.ok) {
    // Graceful degradation: a rate-limited student who already has an (older) practice set still sees something real.
    if (existing) {
      return { success: true, weaknessArea: existing.weaknessArea, instructions: existing.instructions, items: toItems(existing.items), cached: true };
    }
    return { success: false, code: "RATE_LIMITED", error: rateCheck.error };
  }

  const recentAnalyzed = await prisma.writingSubmission.findMany({
    where: { studentId, status: { not: "DRAFT" }, analysis: { isNot: null } },
    orderBy: { createdAt: "desc" },
    take: RECENT_WEAKNESS_LIMIT,
    select: { analysis: { select: { weaknesses: true } } },
  });
  const recentWeaknesses = recentAnalyzed.flatMap((s) => toStringArray(s.analysis?.weaknesses));

  let generated;
  try {
    generated = await generateWritingPractice({ weaknessArea: recommendation.weakestArea, recentWeaknesses });
  } catch (error) {
    const reason = error instanceof AIServiceUnavailableError ? error.message : "Unknown error.";
    console.error("[ai] writing-practice generation failed:", reason);
    if (existing) {
      return { success: true, weaknessArea: existing.weaknessArea, instructions: existing.instructions, items: toItems(existing.items), cached: true };
    }
    return { success: false, code: "UNAVAILABLE", error: "Practice generation is temporarily unavailable. Try again shortly." };
  }

  const saved = await prisma.writingPractice.upsert({
    where: { studentId },
    create: {
      studentId,
      weaknessArea: recommendation.weakestArea,
      instructions: generated.instructions,
      items: generated.items,
      basedOnSubmissionCount: totalAnalyzedNow,
      model: getOpenAIModel(),
    },
    update: {
      weaknessArea: recommendation.weakestArea,
      instructions: generated.instructions,
      items: generated.items,
      basedOnSubmissionCount: totalAnalyzedNow,
      model: getOpenAIModel(),
    },
  });

  await prisma.writingAiActionLog.create({ data: { studentId, action: "PRACTICE", servedFromCache: false } });

  return { success: true, weaknessArea: saved.weaknessArea, instructions: saved.instructions, items: toItems(saved.items), cached: false };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}
