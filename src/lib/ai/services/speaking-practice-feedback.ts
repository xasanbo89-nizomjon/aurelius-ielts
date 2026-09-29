import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildSpeakingPracticeFeedbackPrompt,
  speakingPracticeFeedbackResponseSchema,
  SPEAKING_PRACTICE_FEEDBACK_JSON_SCHEMA,
  type SpeakingPracticeFeedbackContext,
  type SpeakingPracticeFeedbackResponse,
} from "@/lib/ai/prompts/speaking-practice-feedback";

const MIN_ANSWER_WORDS = 15;

export class SpeakingPracticeAnswerTooShortError extends Error {
  constructor(message = "Your answer is too short to evaluate — please write a fuller response.") {
    super(message);
    this.name = "SpeakingPracticeAnswerTooShortError";
  }
}

function roundToHalfBand(value: number): number {
  return Math.min(9, Math.max(0, Math.round(value * 2) / 2));
}

export type SpeakingPracticeFeedbackResult = SpeakingPracticeFeedbackResponse;

/**
 * Phase 37 — generates AI feedback for one typed Speaking Practice answer.
 * Practice + feedback only: this never touches Result, never produces an
 * "official" score, and is entirely separate from the audio-based Speaking
 * evaluation pipeline.
 */
export async function generateSpeakingPracticeFeedback(context: {
  part: 1 | 2 | 3;
  prompt: string;
  cueCardBulletPoints: string[] | null;
  answer: string;
}): Promise<SpeakingPracticeFeedbackResult> {
  const wordCount = context.answer.trim().length > 0 ? context.answer.trim().split(/\s+/).filter(Boolean).length : 0;
  if (wordCount < MIN_ANSWER_WORDS) {
    throw new SpeakingPracticeAnswerTooShortError();
  }

  const promptContext: SpeakingPracticeFeedbackContext = {
    part: context.part,
    prompt: context.prompt,
    cueCardBulletPoints: context.cueCardBulletPoints,
    answer: context.answer,
    wordCount,
  };

  const { system, user } = buildSpeakingPracticeFeedbackPrompt(promptContext);
  const result = await createStructuredCompletion({
    system,
    user,
    schemaName: "speaking_practice_feedback",
    jsonSchema: SPEAKING_PRACTICE_FEEDBACK_JSON_SCHEMA,
    responseSchema: speakingPracticeFeedbackResponseSchema,
    temperature: 0.3,
  });

  return {
    ...result,
    grammarBand: roundToHalfBand(result.grammarBand),
    vocabularyBand: roundToHalfBand(result.vocabularyBand),
    fluencyBand: roundToHalfBand(result.fluencyBand),
    coherenceBand: roundToHalfBand(result.coherenceBand),
    structureBand: roundToHalfBand(result.structureBand),
    overallBand: roundToHalfBand(result.overallBand),
  };
}
