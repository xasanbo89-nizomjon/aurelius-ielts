"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import {
  submitWritingSchema,
  teacherFeedbackSchema,
  rewriteTargetBandSchema,
  writingDraftSchema,
  submitEssaySchema,
} from "@/lib/validations/writing";
import * as writing from "@/lib/ai/writing";
import type {
  RunAnalysisResult,
  RequestRewriteResult,
  RequestSentenceImprovementResult,
  SaveDraftResult,
  SubmitEssayResult,
  RecommendationResult,
} from "@/lib/ai/writing";
import { getOrGeneratePractice, type PracticeResult } from "@/lib/ai/writing-practice";
import { friendlyErrorMessage } from "@/lib/validation-error";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export async function submitWritingAction(
  input: unknown
): Promise<(ActionResult & { submissionId?: string; analysisWarning?: string })> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = submitWritingSchema.parse(input);
    const submission = await writing.createSubmission(profile.id, parsed);

    const analysisResult = await writing.runAnalysis(submission.id, profile.id);
    revalidatePath("/student/writing");

    return {
      success: true,
      submissionId: submission.id,
      analysisWarning: analysisResult.success ? undefined : analysisResult.error,
    };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not submit your writing.") };
  }
}

export async function retryAnalysisAction(submissionId: string): Promise<RunAnalysisResult> {
  const { profile } = await requireStudentProfile();
  const result = await writing.runAnalysis(submissionId, profile.id);
  if (result.success) revalidatePath(`/student/writing/${submissionId}`);
  return result;
}

export async function requestRewriteAction(submissionId: string, targetBand: number): Promise<RequestRewriteResult> {
  const { profile } = await requireStudentProfile();
  const parsedBand = rewriteTargetBandSchema.safeParse(targetBand);
  if (!parsedBand.success) {
    return { success: false, code: "UNAVAILABLE", error: "Choose a valid target band (7, 8, or 9)." };
  }
  const result = await writing.requestRewrite(submissionId, profile.id, parsedBand.data);
  if (result.success) revalidatePath(`/student/writing/${submissionId}`);
  return result;
}

export async function requestSentenceImprovementAction(
  submissionId: string,
  sentence: string
): Promise<RequestSentenceImprovementResult> {
  const { profile } = await requireStudentProfile();
  const result = await writing.requestSentenceImprovement(submissionId, profile.id, sentence);
  if (result.success) revalidatePath(`/student/writing/${submissionId}`);
  return result;
}

export async function addTeacherFeedbackAction(submissionId: string, input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = teacherFeedbackSchema.parse(input);
    await writing.addTeacherFeedback(submissionId, profile.id, parsed);
    revalidatePath(`/teacher/writing-reviews/${submissionId}`);
    revalidatePath("/teacher/writing-reviews");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save your feedback.") };
  }
}

export async function updateDailyWritingActionLimitAction(limit: number): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await writing.setDailyWritingActionLimit(profile.id, limit);
    revalidatePath("/teacher/writing-reviews");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the limit.") };
  }
}

// ---------------------------------------------------------------------------
// AI Writing Center (Phase 13) — draft / submit / recommendations
// ---------------------------------------------------------------------------

export async function saveDraftAction(input: unknown): Promise<SaveDraftResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = writingDraftSchema.parse(input);
    return await writing.saveDraft(profile.id, parsed);
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save your draft.") };
  }
}

export async function submitEssayAction(input: unknown): Promise<SubmitEssayResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = submitEssaySchema.parse(input);
    const result = await writing.submitEssay(profile.id, parsed);
    revalidatePath("/student/writing");
    revalidatePath("/student/writing/history");
    return result;
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not submit your writing.") };
  }
}

export async function getRecommendationAction(): Promise<RecommendationResult> {
  const { profile } = await requireStudentProfile();
  return writing.getOrGenerateRecommendation(profile.id, profile.teacherId);
}

// ---------------------------------------------------------------------------
// Practice Mode (Phase 14, section 10)
// ---------------------------------------------------------------------------

export async function getPracticeAction(): Promise<PracticeResult> {
  const { profile } = await requireStudentProfile();
  return getOrGeneratePractice(profile.id, profile.teacherId);
}
