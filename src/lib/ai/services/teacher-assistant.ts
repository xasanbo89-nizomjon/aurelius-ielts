import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildTeacherAssistantPrompt,
  teacherAssistantResponseSchema,
  TEACHER_ASSISTANT_JSON_SCHEMA,
  type TeacherAssistantResponse,
} from "@/lib/ai/prompts/teacher-assistant";
import type { TeacherAssistantStudentRow } from "@/lib/analytics/teacher-assistant-context";

export async function askTeacherAssistant(
  question: string,
  students: TeacherAssistantStudentRow[]
): Promise<TeacherAssistantResponse> {
  const { system, user } = buildTeacherAssistantPrompt(question, students);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "teacher_assistant",
    jsonSchema: TEACHER_ASSISTANT_JSON_SCHEMA,
    responseSchema: teacherAssistantResponseSchema,
    temperature: 0.3,
  });
}
