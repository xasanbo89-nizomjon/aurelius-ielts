import "server-only";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import {
  buildStudyCoachPrompt,
  studyCoachResponseSchema,
  STUDY_COACH_JSON_SCHEMA,
  type StudyCoachContext,
  type StudyCoachResponse,
} from "@/lib/ai/prompts/study-coach";

export async function generateStudyPlan(context: StudyCoachContext): Promise<StudyCoachResponse> {
  const { system, user } = buildStudyCoachPrompt(context);
  return createStructuredCompletion({
    system,
    user,
    schemaName: "study_coach",
    jsonSchema: STUDY_COACH_JSON_SCHEMA,
    responseSchema: studyCoachResponseSchema,
    temperature: 0.4,
  });
}
