"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import * as speakingPractice from "@/lib/speaking-practice";
import { friendlyErrorMessage } from "@/lib/validation-error";
import {
  createSpeakingTopicSchema,
  speakingQuestionSchema,
  speakingTopicStatusSchema,
  saveSpeakingAnswerSchema,
  submitSpeakingAnswerSchema,
  type CreateSpeakingTopicInput,
  type SpeakingQuestionInput,
} from "@/lib/validations/speaking-practice";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

// ---------------------------------------------------------------------------
// Teacher — Speaking Topics
// ---------------------------------------------------------------------------

export async function createSpeakingTopicAction(input: CreateSpeakingTopicInput): Promise<ActionResult & { topicId?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createSpeakingTopicSchema.parse(input);
    const topic = await speakingPractice.createSpeakingTopic(profile.id, parsed);
    revalidatePath("/teacher/speaking-topics");
    return { success: true, topicId: topic.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the topic.") };
  }
}

export async function updateSpeakingTopicAction(topicId: string, input: CreateSpeakingTopicInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createSpeakingTopicSchema.parse(input);
    await speakingPractice.updateSpeakingTopic(topicId, profile.id, parsed);
    revalidatePath(`/teacher/speaking-topics/${topicId}`);
    revalidatePath("/teacher/speaking-topics");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the topic.") };
  }
}

export async function setSpeakingTopicStatusAction(topicId: string, status: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = speakingTopicStatusSchema.parse(status);
    await speakingPractice.setSpeakingTopicStatus(topicId, profile.id, parsed);
    revalidatePath("/teacher/speaking-topics");
    revalidatePath(`/teacher/speaking-topics/${topicId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the topic status.") };
  }
}

export async function addSpeakingQuestionAction(topicId: string, input: SpeakingQuestionInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = speakingQuestionSchema.parse(input);
    await speakingPractice.addSpeakingQuestion(topicId, profile.id, parsed);
    revalidatePath(`/teacher/speaking-topics/${topicId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not add the question.") };
  }
}

export async function updateSpeakingQuestionAction(
  questionId: string,
  topicId: string,
  input: SpeakingQuestionInput
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = speakingQuestionSchema.parse(input);
    await speakingPractice.updateSpeakingQuestion(questionId, profile.id, parsed);
    revalidatePath(`/teacher/speaking-topics/${topicId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the question.") };
  }
}

export async function deleteSpeakingQuestionAction(questionId: string, topicId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await speakingPractice.deleteSpeakingQuestion(questionId, profile.id);
    revalidatePath(`/teacher/speaking-topics/${topicId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the question.") };
  }
}

// ---------------------------------------------------------------------------
// Student — practice flow
// ---------------------------------------------------------------------------

export async function startSpeakingPracticeAction(input: {
  topicId: string;
  questionId: string | null;
  part: "PART_1" | "PART_2" | "PART_3";
}): Promise<ActionResult & { attemptId?: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const attempt = await speakingPractice.createSpeakingAttempt(profile.id, input);
    return { success: true, attemptId: attempt.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not start practice.") };
  }
}

export async function saveSpeakingDraftAction(input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = saveSpeakingAnswerSchema.parse(input);
    await speakingPractice.saveSpeakingDraft(profile.id, parsed.attemptId, parsed.content);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save your draft.") };
  }
}

export async function submitSpeakingAnswerAction(input: unknown): Promise<ActionResult & { attemptId?: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = submitSpeakingAnswerSchema.parse(input);
    const result = await speakingPractice.submitSpeakingAttempt(profile.id, parsed.attemptId, parsed.content);
    if (!result.success) return result;
    revalidatePath("/student/speaking-practice/history");
    revalidatePath("/student/dashboard");
    return result;
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not submit your answer.") };
  }
}
