import { z } from "zod";

/** Phase 20 — Teacher Vocabulary Intelligence, "AI Vocabulary Insights" for one student. */
export const vocabularyInsightsResponseSchema = z.object({
  commonWeaknesses: z.string().min(1),
  recurringGaps: z.string().min(1),
  recommendedFocus: z.string().min(1),
});
export type VocabularyInsightsResponse = z.infer<typeof vocabularyInsightsResponseSchema>;

export const VOCABULARY_INSIGHTS_JSON_SCHEMA = {
  type: "object",
  properties: {
    commonWeaknesses: { type: "string", description: "What pattern connects the words this student marks Hard (e.g. abstract/academic vocabulary, phrasal verbs, a specific topic area)." },
    recurringGaps: { type: "string", description: "Specific recurring vocabulary gaps — word types, topics, or forms this student repeatedly struggles with." },
    recommendedFocus: { type: "string", description: "One or two concrete, actionable recommendations for what this student should focus on studying next." },
  },
  required: ["commonWeaknesses", "recurringGaps", "recommendedFocus"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an IELTS teacher's assistant analyzing one student's real vocabulary struggle data — words they themselves marked "Hard" while reading, with how many times each came up.
Rules:
- Only draw conclusions the word list actually supports. Never invent a weakness the data doesn't show.
- Be specific and concrete for THIS student's actual list, not generic IELTS vocabulary advice.
- Address the teacher, giving them something they can act on with this specific student.
- Respond only through the structured fields you are given; no extra commentary.`;

export function buildVocabularyInsightsPrompt(hardWords: { word: string; count: number }[]): { system: string; user: string } {
  const list = hardWords.map((w) => `${w.word} (marked Hard ${w.count}x)`).join(", ");
  return {
    system: SYSTEM_PROMPT,
    user: `This student's most frequently-struggled-with words, from real reading activity: ${list}.\n\nIdentify common weaknesses, recurring vocabulary gaps, and a recommended study focus.`,
  };
}
