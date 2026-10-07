import type { FeedbackLanguage } from "@/lib/speaking-audio/constants";

/**
 * Phase Q-B - did the AI write the explanation in the language the student chose? A model told to write Uzbek feedback about an English answer sometimes answers in English
 * (the answer it is looking at is English, and so are the examples). The check is deliberately crude and only ever asks for ONE more try: a text counts as English when a
 * fifth or more of its words are very common English words (Uzbek in Latin script has almost none of them). Pure.
 */

const ENGLISH_WORDS = new Set(
  "the and you your was were with that this is are of to in for but not on it had have should could would can will a an as at by be been from or if so which there their they them what when where how also more most very too only just than then".split(" ")
);

/** The share (0..1) of the words of a text that are very common English words; 0 for a text too short to tell. */
export function englishShare(text: string): number {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 6) return 0;
  return words.filter((word) => ENGLISH_WORDS.has(word)).length / words.length;
}

export const writtenInEnglish = (text: string): boolean => englishShare(text) >= 0.2;

/** The text fields of an assessment that must be in the feedback language. */
export type FeedbackTexts = { summary: string; strengths: string[]; mistakes: { problem: string }[] };

/** Why the reply is not in the language asked for (a sentence to send back to the model), or null when it is. Only an Uzbek request is checked: English is what the model drifts to. */
export function languageReason(texts: FeedbackTexts, language: FeedbackLanguage): string | null {
  if (language !== "uz") return null;
  const written = [texts.summary, ...texts.strengths, ...texts.mistakes.map((mistake) => mistake.problem)].join(" ");
  return writtenInEnglish(written)
    ? 'The explanation was written in English, but it must be written in Uzbek (Latin script, O\'zbek tili): rewrite "summary", "strengths" and every "problem" in Uzbek. Only what the student could say aloud stays in English.'
    : null;
}
