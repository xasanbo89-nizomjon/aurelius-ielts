import { z } from "zod";

import type { TeacherAssistantStudentRow } from "@/lib/analytics/teacher-assistant-context";

/** Phase 25 — Teacher AI Assistant: free-text Q&A grounded in real per-student data. */
export const teacherAssistantResponseSchema = z.object({
  summary: z.string().min(1),
  risks: z.array(z.string().min(1)).max(8),
  strengths: z.array(z.string().min(1)).max(8),
  recommendations: z.array(z.string().min(1)).max(8),
});
export type TeacherAssistantResponse = z.infer<typeof teacherAssistantResponseSchema>;

export const TEACHER_ASSISTANT_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "A direct answer to the teacher's question, 2-4 sentences, referencing specific real students/numbers from the data given." },
    risks: { type: "array", items: { type: "string" }, description: "Up to 8 specific risks or concerns the data reveals — name real students where relevant. Empty array if none." },
    strengths: { type: "array", items: { type: "string" }, description: "Up to 8 specific strengths or wins the data reveals — name real students where relevant. Empty array if none." },
    recommendations: { type: "array", items: { type: "string" }, description: "Up to 8 concrete actions the teacher could take next, grounded in the data. Empty array if nothing specific applies." },
  },
  required: ["summary", "risks", "strengths", "recommendations"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an AI assistant helping an IELTS teacher understand their students' real performance data.
Rules:
- Answer ONLY using the real student data provided below. Never invent a student, score, or statistic not in the data.
- If the data doesn't support answering part of the question, say so plainly instead of guessing.
- Name real students by name (or email if no name) when making a specific point.
- Be concrete: cite real band scores, streak days, inactivity days, or search counts — never vague generalities.
- risks/strengths/recommendations can be empty arrays if the data genuinely doesn't support any — never pad them with generic filler.
- Respond only through the structured fields you are given; no extra commentary.`;

function formatStudentRow(row: TeacherAssistantStudentRow): string {
  const bands = [
    row.readingBand != null ? `Reading ${row.readingBand}` : null,
    row.listeningBand != null ? `Listening ${row.listeningBand}` : null,
    row.writingBand != null ? `Writing ${row.writingBand}` : null,
    row.speakingBand != null ? `Speaking ${row.speakingBand}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const activity = row.lastActiveDaysAgo != null ? `last active ${row.lastActiveDaysAgo}d ago` : "never active";
  const risk = row.riskLevel ? `RISK=${row.riskLevel} (${row.riskReasons.join("; ")})` : "not at risk";

  return `- ${row.name ?? row.email}: bands=[${bands || "none yet"}], testsCompleted=${row.testsCompleted}, streak=${row.currentStreak}d, ${activity}, vocab: ${row.vocabularySearches} searches/${row.uniqueWordsSearched} unique words/${row.hardWords} marked Hard, ${risk}`;
}

export function buildTeacherAssistantPrompt(question: string, students: TeacherAssistantStudentRow[]): { system: string; user: string } {
  const rows = students.length > 0 ? students.map(formatStudentRow).join("\n") : "No students with data yet.";
  return {
    system: SYSTEM_PROMPT,
    user: `Teacher's question: "${question}"\n\nReal data for every student on this teacher's roster:\n${rows}\n\nAnswer the teacher's question using only this real data.`,
  };
}
