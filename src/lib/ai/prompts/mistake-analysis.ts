import { z } from "zod";

/** Phase 23 — AI Mistake Analysis Engine / AI Performance Dashboard (consolidated: same real weakness/strength data drives both). */
export const mistakeAnalysisResponseSchema = z.object({
  // min(0), not min(1): a student can genuinely have zero identified
  // strengths (or weaknesses) this early — forcing at least one would
  // pressure the model into inventing one the data doesn't support.
  topStrengths: z.array(z.string().min(1)).max(5),
  topWeaknesses: z.array(z.string().min(1)).max(5),
  mostFrequentMistakes: z.string().min(1),
  recommendedFocusAreas: z.array(z.string().min(1)).max(5),
  progressTrend: z.string().min(1),
});
export type MistakeAnalysisResponse = z.infer<typeof mistakeAnalysisResponseSchema>;

export const MISTAKE_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    topStrengths: { type: "array", items: { type: "string" }, description: "Up to 5 of this student's real top-performing areas, by name (e.g. 'Listening — Multiple Choice')." },
    topWeaknesses: { type: "array", items: { type: "string" }, description: "Up to 5 of this student's real lowest-performing areas, by name." },
    mostFrequentMistakes: { type: "string", description: "A short paragraph describing the pattern behind this student's most common mistakes, based only on the data given." },
    recommendedFocusAreas: { type: "array", items: { type: "string" }, description: "Up to 5 concrete areas this student should focus on next." },
    progressTrend: { type: "string", description: "A short, honest read of whether this student's real scores are trending up, down, or flat, based only on the data given." },
  },
  required: ["topStrengths", "topWeaknesses", "mostFrequentMistakes", "recommendedFocusAreas", "progressTrend"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an IELTS performance analyst reviewing one student's real, aggregated test data across Reading, Listening, Writing and Speaking.
Rules:
- Only draw conclusions the data actually supports. Never invent a weakness/strength the data doesn't show, and never mention a skill with no data provided.
- Be specific to THIS student's real numbers, not generic IELTS advice.
- Respond only through the structured fields you are given; no extra commentary.`;

export function buildMistakeAnalysisPrompt(insights: { label: string; detail: string; tone: string }[]): { system: string; user: string } {
  const list = insights.map((i) => `- ${i.label}: ${i.detail} (${i.tone})`).join("\n");
  return {
    system: SYSTEM_PROMPT,
    user: `Here is this student's real performance data across all skills:\n${list || "No sufficient data yet."}\n\nIdentify top strengths, top weaknesses, the pattern behind their most frequent mistakes, recommended focus areas, and their overall progress trend.`,
  };
}
