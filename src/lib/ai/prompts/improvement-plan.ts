import { z } from "zod";

/** Phase 23 — AI Improvement Plan: a 7-day roadmap generated from real weaknesses. */
export const improvementPlanResponseSchema = z.object({
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(7),
        focus: z.string().min(1),
        task: z.string().min(1),
      })
    )
    .length(7),
});
export type ImprovementPlanResponse = z.infer<typeof improvementPlanResponseSchema>;

export const IMPROVEMENT_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          day: { type: "integer", description: "1 through 7" },
          focus: { type: "string", description: "A short focus area title, e.g. 'True/False/Not Given Practice'." },
          task: { type: "string", description: "A concrete, doable task for that day, 1-2 sentences." },
        },
        required: ["day", "focus", "task"],
        additionalProperties: false,
      },
    },
  },
  required: ["days"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an IELTS study planner building a 7-day improvement roadmap for one real student, based only on their real, measured weaknesses.
Rules:
- Prioritize the student's actual weakest areas first (earlier days), mixing in variety across the week.
- Never plan a day around a skill/area with no real weakness data provided.
- Each task must be concrete and doable in one study session — not vague advice.
- Respond only through the structured fields you are given; no extra commentary.`;

export function buildImprovementPlanPrompt(weaknesses: { label: string; detail: string }[]): { system: string; user: string } {
  const list = weaknesses.map((w) => `- ${w.label}: ${w.detail}`).join("\n");
  return {
    system: SYSTEM_PROMPT,
    user: `This student's real measured weaknesses:\n${list || "No specific weaknesses detected yet — build a balanced general-practice week across Reading, Listening and Writing."}\n\nBuild a 7-day improvement roadmap, Day 1 through Day 7.`,
  };
}
