"use server";

import { requireStudentProfile } from "@/lib/session";
import {
  getWordIntelligence,
  explainWord,
  type GetWordIntelligenceResult,
  type ExplainWordResult,
} from "@/lib/ai/vocabulary-assistant";
import { friendlyErrorMessage } from "@/lib/validation-error";
import { getWordDetailsSchema } from "@/lib/validations/vocabulary";

/**
 * Every AI Vocabulary Assistant call is server-side only, behind
 * requireStudentProfile() — the OpenAI API key (src/lib/ai/openai.ts) never
 * reaches the browser, and the prompt text is never returned to the client,
 * only the final structured result.
 */
export async function getWordIntelligenceAction(word: string): Promise<GetWordIntelligenceResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = getWordDetailsSchema.parse({ word });
    return await getWordIntelligence(profile.id, profile.teacherId, parsed.word);
  } catch (error) {
    return { success: false, code: "UNAVAILABLE", error: friendlyErrorMessage(error, "Could not load AI insights for that word.") };
  }
}

export async function explainWordAction(word: string): Promise<ExplainWordResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = getWordDetailsSchema.parse({ word });
    return await explainWord(profile.id, profile.teacherId, parsed.word);
  } catch (error) {
    return { success: false, code: "UNAVAILABLE", error: friendlyErrorMessage(error, "Could not explain that word.") };
  }
}
