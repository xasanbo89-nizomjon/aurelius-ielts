import { z } from "zod";

/** Phase 12.3, section 2 — the "Explain Word" deep-dive, distinct from the basic word panel. */
export const explainWordResponseSchema = z.object({
  meaning: z.string().min(1),
  usage: z.string().min(1),
  commonMistakes: z.string().min(1),
  whenToUse: z.string().min(1),
  whenNotToUse: z.string().min(1),
});
export type ExplainWordResponse = z.infer<typeof explainWordResponseSchema>;

export const EXPLAIN_WORD_JSON_SCHEMA = {
  type: "object",
  properties: {
    meaning: { type: "string", description: "A clear, student-friendly explanation of what the word means." },
    usage: { type: "string", description: "How the word is typically used in a sentence — grammar pattern, collocations." },
    commonMistakes: { type: "string", description: "A common mistake learners make with this word (confusion with a similar word, wrong preposition, wrong register, etc.)." },
    whenToUse: { type: "string", description: "A concrete situation or context where this word is the right choice." },
    whenNotToUse: { type: "string", description: "A concrete situation where this word would be wrong or unnatural, and what to use instead." },
  },
  required: ["meaning", "usage", "commonMistakes", "whenToUse", "whenNotToUse"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are a friendly, encouraging IELTS tutor explaining one English word in depth to a student who has saved it to their vocabulary notebook because they want to really understand it.
Rules:
- Be concrete and specific — a few sentences per field, not a dictionary definition restated five times.
- Address the student directly, in plain, student-friendly language — no jargon.
- Only state things that are actually true about the word. Never invent a rule or mistake that doesn't apply to this specific word.
- Respond only through the structured fields you are given; do not add extra commentary.`;

export function buildExplainWordPrompt(word: string): { system: string; user: string } {
  return {
    system: SYSTEM_PROMPT,
    user: `Explain the English word "${word}" to an IELTS student: its meaning, how it's used, a common mistake learners make with it, when to use it, and when NOT to use it.`,
  };
}
