import { z } from "zod";

/** Phase 25 — AI Motivation Engine: one short personalized message from real streak/activity/progress data. */
export const motivationResponseSchema = z.object({
  message: z.string().min(1).max(280),
  tone: z.enum(["ENCOURAGEMENT", "IMPROVEMENT_ALERT", "CELEBRATION"]),
});
export type MotivationResponse = z.infer<typeof motivationResponseSchema>;

export const MOTIVATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string", description: "One short (1-2 sentence), specific, personal message referencing the real data given — never generic filler." },
    tone: { type: "string", enum: ["ENCOURAGEMENT", "IMPROVEMENT_ALERT", "CELEBRATION"], description: "CELEBRATION for a real achievement/streak milestone/improving trend, IMPROVEMENT_ALERT for real inactivity/decline, ENCOURAGEMENT otherwise." },
  },
  required: ["message", "tone"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are writing one short, warm, personal motivational message for an IELTS student, based only on their real study data.
Rules:
- Reference at least one real specific number from the data (streak days, band trend, days inactive, tests completed).
- Never invent an achievement, score, or activity not in the data.
- Keep it to 1-2 sentences, genuinely encouraging, never generic ("keep it up!" alone is not enough — say WHY, using their real numbers).
- Pick the tone that honestly matches the data: celebration for a real win, an improvement alert for real inactivity/decline, encouragement otherwise.
- Respond only through the structured fields you are given; no extra commentary.`;

export function buildMotivationPrompt(context: {
  currentStreak: number;
  longestStreak: number;
  lastActiveDaysAgo: number | null;
  trend: string;
  testsCompleted: number;
  weeklyDelta: number | null;
}): { system: string; user: string } {
  const lines = [
    `Current streak: ${context.currentStreak} days (longest ever: ${context.longestStreak} days)`,
    context.lastActiveDaysAgo != null ? `Last active: ${context.lastActiveDaysAgo} days ago` : "Never active yet",
    `Overall trend: ${context.trend}`,
    `Tests completed: ${context.testsCompleted}`,
    context.weeklyDelta != null ? `This week's band vs last week: ${context.weeklyDelta > 0 ? "+" : ""}${context.weeklyDelta}` : "Not enough recent tests to compare weeks",
  ];
  return { system: SYSTEM_PROMPT, user: lines.join("\n") };
}
