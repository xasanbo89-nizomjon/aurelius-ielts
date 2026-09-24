import { z } from "zod";

/** Phase 23 — Teacher AI Report on a student's real performance. */
export const teacherReportResponseSchema = z.object({
  strengths: z.string().min(1),
  weaknesses: z.string().min(1),
  recommendations: z.string().min(1),
});
export type TeacherReportResponse = z.infer<typeof teacherReportResponseSchema>;

export const TEACHER_REPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    strengths: { type: "string", description: "A short paragraph on this student's real strengths, from the data given." },
    weaknesses: { type: "string", description: "A short paragraph on this student's real weaknesses, from the data given." },
    recommendations: { type: "string", description: "Concrete recommendations for how the teacher could help this specific student next." },
  },
  required: ["strengths", "weaknesses", "recommendations"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an assistant summarizing one student's real performance for their IELTS teacher.
Rules:
- Address the teacher, not the student.
- Only draw conclusions the real data given actually supports.
- Recommendations must be concrete things the teacher could actually do (e.g. assign a specific practice type, review a specific skill in a 1:1).
- Respond only through the structured fields you are given; no extra commentary.`;

export function buildTeacherReportPrompt(input: {
  overview: string;
  insights: { label: string; detail: string; tone: string }[];
}): { system: string; user: string } {
  const list = input.insights.map((i) => `- ${i.label}: ${i.detail} (${i.tone})`).join("\n");
  return {
    system: SYSTEM_PROMPT,
    user: `Overview: ${input.overview}\n\nReal performance data:\n${list || "No sufficient data yet."}\n\nSummarize strengths, weaknesses, and give concrete recommendations for the teacher.`,
  };
}
