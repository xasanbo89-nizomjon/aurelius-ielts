import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildTeacherReportPrompt,
  teacherReportResponseSchema,
  TEACHER_REPORT_JSON_SCHEMA,
  type TeacherReportResponse,
} from "@/lib/ai/prompts/teacher-report";
import type { CombinedSkillInsight } from "@/lib/analytics/student-insights";

export async function generateTeacherReport(
  overview: string,
  insights: CombinedSkillInsight[]
): Promise<TeacherReportResponse> {
  const { system, user } = buildTeacherReportPrompt({ overview, insights });
  return createStructuredCompletion({
    system,
    user,
    schemaName: "teacher_report",
    jsonSchema: TEACHER_REPORT_JSON_SCHEMA,
    responseSchema: teacherReportResponseSchema,
    temperature: 0.4,
  });
}
