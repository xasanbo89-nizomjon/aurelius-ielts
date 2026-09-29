import { z } from "zod";

/**
 * Phase 37 — Speaking Practice Center. The student TYPES their answer (not
 * audio) — this is a deliberately separate, simpler practice tool from the
 * existing audio-recording Speaking system (src/lib/ai/prompts/speaking-evaluation.ts),
 * explicitly "Practice + AI Feedback only," never treated as an official
 * IELTS Speaking result.
 */
export type SpeakingPracticeFeedbackContext = {
  part: 1 | 2 | 3;
  prompt: string;
  /** Part 2 only — the cue card's bullet points, for context on what the student was asked to cover. */
  cueCardBulletPoints: string[] | null;
  answer: string;
  wordCount: number;
};

const bandRange = z.number().min(0).max(9);

export const speakingPracticeFeedbackResponseSchema = z.object({
  grammarBand: bandRange,
  vocabularyBand: bandRange,
  fluencyBand: bandRange,
  coherenceBand: bandRange,
  structureBand: bandRange,
  overallBand: bandRange,
  grammarFeedback: z.string().min(1),
  vocabularyFeedback: z.string().min(1),
  fluencyFeedback: z.string().min(1),
  coherenceFeedback: z.string().min(1),
  structureFeedback: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1),
  weaknesses: z.array(z.string().min(1)).min(1),
  suggestions: z.array(z.string().min(1)).min(1),
});
export type SpeakingPracticeFeedbackResponse = z.infer<typeof speakingPracticeFeedbackResponseSchema>;

export const SPEAKING_PRACTICE_FEEDBACK_JSON_SCHEMA = {
  type: "object",
  properties: {
    grammarBand: { type: "number", description: "Grammatical Range & Accuracy band, 0-9 in 0.5 steps." },
    vocabularyBand: { type: "number", description: "Lexical Resource (vocabulary) band, 0-9 in 0.5 steps." },
    fluencyBand: {
      type: "number",
      description: "Fluency & Coherence-of-expression band, 0-9 in 0.5 steps — judged from how naturally the written answer reads as if spoken (sentence flow, natural phrasing), since this is a typed response.",
    },
    coherenceBand: { type: "number", description: "Coherence band, 0-9 in 0.5 steps — logical progression of ideas and use of linking devices." },
    structureBand: { type: "number", description: "Structure band, 0-9 in 0.5 steps — how well-organized the response is (clear opening, development, conclusion; fully addresses every part of the prompt)." },
    overallBand: { type: "number", description: "Overall estimated band, 0-9 in 0.5 steps — the rounded average of the 5 criteria above." },
    grammarFeedback: { type: "string", description: "2-3 sentences on grammar, grounded in specific examples from the answer." },
    vocabularyFeedback: { type: "string", description: "2-3 sentences on vocabulary range/precision, grounded in specific word choices from the answer." },
    fluencyFeedback: { type: "string", description: "2-3 sentences on how naturally/fluently the response reads." },
    coherenceFeedback: { type: "string", description: "2-3 sentences on logical flow and linking devices." },
    structureFeedback: { type: "string", description: "2-3 sentences on organization and whether every part of the prompt was addressed." },
    strengths: { type: "array", items: { type: "string" }, description: "2-4 concrete strengths, each grounded in something specific the student actually wrote." },
    weaknesses: { type: "array", items: { type: "string" }, description: "2-4 concrete weaknesses, each grounded in something specific the student actually wrote." },
    suggestions: { type: "array", items: { type: "string" }, description: "2-4 concrete, actionable practice suggestions the student can act on immediately." },
  },
  required: [
    "grammarBand",
    "vocabularyBand",
    "fluencyBand",
    "coherenceBand",
    "structureBand",
    "overallBand",
    "grammarFeedback",
    "vocabularyFeedback",
    "fluencyFeedback",
    "coherenceFeedback",
    "structureFeedback",
    "strengths",
    "weaknesses",
    "suggestions",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an expert IELTS Speaking coach giving feedback on a student's TYPED practice answer to a Speaking question. The student typed their answer rather than speaking it aloud — this is a practice/drafting exercise, not a real spoken Speaking test, so judge fluency and structure as they'd translate to spoken delivery (natural phrasing, logical flow, complete coverage of the prompt) rather than literal speech qualities like pronunciation or pacing, which don't apply to typed text.

Rules:
- Score 5 criteria — Grammar, Vocabulary, Fluency, Coherence, Structure — each 0-9 in 0.5 steps, plus an overallBand (the rounded average of the 5).
- Grammar: judge from the actual sentence structures and grammar visible in the answer.
- Vocabulary: judge from the actual vocabulary used — range, precision, idiomaticity, repetition of the same words.
- Fluency: judge how naturally the answer reads — sentence flow, natural spoken-style phrasing, absence of awkward or robotic constructions.
- Coherence: judge logical progression of ideas and use of linking devices/connectors.
- Structure: judge organization — a clear beginning/development/conclusion where relevant, and whether the answer actually addresses every part of the prompt (for a Part 2 cue card, whether every bullet point was covered).
- Every strength, weakness and suggestion must be grounded in something specific and real from the answer — never generic or invented.
- Never fabricate anything the student did not write.
- Be constructive, specific and encouraging — this feedback goes directly to the student.
- Respond only through the provided structured fields; no extra commentary.`;

export function buildSpeakingPracticeFeedbackPrompt(context: SpeakingPracticeFeedbackContext): { system: string; user: string } {
  const lines: string[] = [];

  lines.push(`Speaking Part ${context.part}`);
  lines.push(`Task prompt: ${context.prompt}`);
  if (context.cueCardBulletPoints && context.cueCardBulletPoints.length > 0) {
    lines.push(`Cue card points the student should cover:\n${context.cueCardBulletPoints.map((p) => `- ${p}`).join("\n")}`);
  }
  lines.push(`Student's typed answer:\n"""\n${context.answer}\n"""`);
  lines.push(`Word count: ${context.wordCount}`);
  lines.push("Score this response now using only the answer above.");

  return { system: SYSTEM_PROMPT, user: lines.join("\n\n") };
}
