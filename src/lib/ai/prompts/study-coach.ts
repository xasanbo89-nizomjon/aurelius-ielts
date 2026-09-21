import { z } from "zod";

export type StudyCoachAccuracyPoint = { label: string; accuracy: number; sampleSize: number };
export type StudyCoachRecentResult = {
  testTitle: string;
  skill: string;
  scorePercent: number | null;
  bandScore: number | null;
  completedAt: string;
};

/**
 * Everything the model needs to write a plan grounded in this one student's
 * real data — weaknesses/strengths/recent results are already-computed real
 * analytics (Weakness Tracker, Strength Tracker, Test History), never
 * invented here. The model only turns them into a plan.
 */
export type StudyCoachContext = {
  estimatedBand: number | null;
  cefrLabel: string | null;
  targetBand: number | null;
  testsCompleted: number;
  avgScorePercent: number | null;
  weaknesses: StudyCoachAccuracyPoint[];
  strengths: StudyCoachAccuracyPoint[];
  recentResults: StudyCoachRecentResult[];
};

const studyPlanDaySchema = z.object({
  day: z.number().int(),
  focus: z.string().min(1),
  tasks: z.array(z.string().min(1)).min(1),
});

const roadmapMilestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  targetBand: z.number().nullable(),
});

export const studyCoachResponseSchema = z.object({
  summary: z.string().min(1),
  weeklyPlan: z.array(studyPlanDaySchema).min(1),
  roadmap: z.array(roadmapMilestoneSchema).min(1),
});
export type StudyCoachResponse = z.infer<typeof studyCoachResponseSchema>;

export const STUDY_COACH_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "A short, encouraging 2-3 sentence overview of the plan and why it targets these areas.",
    },
    weeklyPlan: {
      type: "array",
      description: "Exactly 7 entries, Day 1 through Day 7, each with one clear focus and concrete tasks.",
      items: {
        type: "object",
        properties: {
          day: { type: "integer", description: "1 through 7." },
          focus: { type: "string", description: "e.g. 'Reading — True/False/Not Given'." },
          tasks: {
            type: "array",
            items: { type: "string" },
            description: "2-4 concrete, specific action items for this day.",
          },
        },
        required: ["day", "focus", "tasks"],
        additionalProperties: false,
      },
    },
    roadmap: {
      type: "array",
      description: "3-4 milestones charting a realistic path from the current estimated band to the target band.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "e.g. 'Weeks 1-2: Foundation'." },
          description: { type: "string" },
          targetBand: {
            type: ["number", "null"],
            description: "Interim band checkpoint for this milestone, or null if not applicable.",
          },
        },
        required: ["title", "description", "targetBand"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "weeklyPlan", "roadmap"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an expert IELTS study coach creating a personalized study plan from a student's real performance data.
Rules:
- Base every recommendation strictly on the weaknesses, strengths, and results provided. Never invent scores, skills, or results not mentioned.
- Prioritize the student's real weaknesses; include lighter maintenance work for strengths.
- Be concrete and specific (name question types, skills, sections) — never generic advice like "practice more".
- Be realistic: chart a sensible path of milestones, never promise a specific band jump by a specific date.
- Keep the tone encouraging and professional.
- Respond only through the provided structured fields; do not add extra commentary.`;

export function buildStudyCoachPrompt(context: StudyCoachContext): { system: string; user: string } {
  const lines: string[] = [];

  lines.push(
    context.estimatedBand != null
      ? `Current estimated band: ${context.estimatedBand}${context.cefrLabel ? ` (${context.cefrLabel})` : ""}`
      : "Current estimated band: not enough data yet"
  );
  lines.push(context.targetBand != null ? `Target band: ${context.targetBand}` : "Target band: not set by the student — suggest a realistic next milestone instead.");
  lines.push(`Tests completed: ${context.testsCompleted}`);
  lines.push(
    context.avgScorePercent != null ? `Average score: ${context.avgScorePercent}%` : "Average score: not enough data yet"
  );

  lines.push(
    context.weaknesses.length > 0
      ? `Weaknesses (lower accuracy = higher priority):\n${context.weaknesses
          .map((w) => `- ${w.label}: ${w.accuracy}% accuracy (${w.sampleSize} questions)`)
          .join("\n")}`
      : "Weaknesses: none identified yet (not enough graded questions in any one category)."
  );

  lines.push(
    context.strengths.length > 0
      ? `Strengths:\n${context.strengths.map((s) => `- ${s.label}: ${s.accuracy}% accuracy (${s.sampleSize} questions)`).join("\n")}`
      : "Strengths: none identified yet."
  );

  lines.push(
    context.recentResults.length > 0
      ? `Recent test results (most recent first):\n${context.recentResults
          .map(
            (r) =>
              `- ${r.testTitle} (${r.skill}), ${r.completedAt}: ${r.scorePercent != null ? `${r.scorePercent}%` : "—"}${
                r.bandScore != null ? `, band ${r.bandScore}` : ""
              }`
          )
          .join("\n")}`
      : "Recent test results: none yet."
  );

  lines.push(
    "Generate: a short summary, a 7-day weekly study plan (Day 1 through Day 7) that prioritizes the weaknesses above with some strength maintenance, and a realistic roadmap of milestones from the current estimated band toward the target band."
  );

  return { system: SYSTEM_PROMPT, user: lines.join("\n\n") };
}
