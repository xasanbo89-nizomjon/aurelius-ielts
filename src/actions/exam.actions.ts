"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import * as attempts from "@/lib/exam/attempts";
import * as annotations from "@/lib/exam/annotations";
import { hasActiveAccess, hasActiveAccessForTest, hasActiveAccessForResult } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { generateWrongAnswerExplanation } from "@/lib/ai/services/explain-wrong-answer";
import type { ExplainWrongAnswerResponse } from "@/lib/ai/prompts/explain-wrong-answer";
import { AIServiceUnavailableError } from "@/lib/ai/errors";

export type ActionResult = { success: true } | { success: false; error: string };

export async function startAttemptAction(mockTestId: string) {
  const { profile } = await requireStudentProfile();

  // Real, server-side gate — never trust that the "Start test" button was
  // only shown to students with active access. Cambridge tests bypass this
  // entirely (the platform's one free tier), checked server-side too.
  if (!(await hasActiveAccessForTest(profile.id, mockTestId))) {
    redirect("/student/subscription?upgrade=1");
  }

  const attempt = await attempts.getOrCreateAttempt(profile.id, mockTestId);

  if (!attempt) {
    redirect("/student/dashboard?error=test-unavailable");
  }

  redirect(`/student/exam/attempt/${attempt.id}`);
}

export type ExplainWrongAnswerResult =
  | { success: true; explanation: ExplainWrongAnswerResponse }
  | { success: false; error: string };

/**
 * Phase 20/23 — Test Results redesign, "Explain More" per wrong question.
 * Question content, the student's response, the correct answer, and the
 * source passage (Reading) are all re-fetched here from the student's OWN
 * completed attempt — never trusted from the client — so this can't be used
 * to probe another student's answers or a question the student never
 * actually got. Generated on demand, not persisted: a re-click just asks
 * again (deliberately separate from AIInsightCache, which is for the
 * heavier, less-frequently-regenerated Band Score Center reports).
 */
export async function explainWrongAnswerAction(resultId: string, questionId: string): Promise<ExplainWrongAnswerResult> {
  try {
    const { profile } = await requireStudentProfile();

    if (!(await hasActiveAccess(profile.id))) {
      return { success: false, error: "AI Explain More is a Premium feature. Upgrade to unlock it." };
    }

    const result = await prisma.result.findFirst({
      where: { id: resultId, studentId: profile.id, completedAt: { not: null } },
      select: { id: true },
    });
    if (!result) return { success: false, error: "Attempt not found." };

    const [question, answer] = await Promise.all([
      prisma.question.findFirst({
        where: { id: questionId, mockTest: { results: { some: { id: resultId } } } },
        select: { type: true, prompt: true, options: true, correctAnswer: true, passage: { select: { content: true } } },
      }),
      prisma.answer.findUnique({ where: { resultId_questionId: { resultId, questionId } }, select: { response: true } }),
    ]);
    if (!question) return { success: false, error: "Question not found." };

    const explanation = await generateWrongAnswerExplanation({
      questionType: question.type,
      prompt: question.prompt,
      options: question.options,
      studentResponse: answer?.response ?? null,
      correctAnswer: question.correctAnswer,
      passage: question.passage?.content ?? null,
    });

    return { success: true, explanation };
  } catch (error) {
    if (error instanceof AIServiceUnavailableError) {
      return { success: false, error: "AI explanations are temporarily unavailable. Try again in a moment." };
    }
    return { success: false, error: "Could not generate an explanation." };
  }
}

export async function saveAnswerAction(
  resultId: string,
  questionId: string,
  response: Prisma.InputJsonValue
): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await attempts.saveAnswer(resultId, profile.id, questionId, response);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save your answer." };
  }
}

export async function toggleFlagAction(
  resultId: string,
  questionId: string
): Promise<ActionResult & { flags?: string[] }> {
  try {
    const { profile } = await requireStudentProfile();
    const flags = await attempts.toggleFlag(resultId, profile.id, questionId);
    return { success: true, flags };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not update flag." };
  }
}

export async function addHighlightAction(
  resultId: string,
  input: { passageId: string; text: string; startOffset: number; endOffset: number }
): Promise<ActionResult & { highlightId?: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const highlight = await annotations.addHighlight(resultId, profile.id, input);
    return { success: true, highlightId: highlight.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save highlight." };
  }
}

export async function removeHighlightAction(resultId: string, highlightId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.removeHighlight(resultId, profile.id, highlightId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not remove highlight." };
  }
}

export async function saveNoteAction(
  resultId: string,
  input: { noteId?: string; passageId?: string; content: string }
): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.saveNote(resultId, profile.id, input);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save note." };
  }
}

export async function deleteNoteAction(resultId: string, noteId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.deleteNote(resultId, profile.id, noteId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not delete note." };
  }
}

export async function submitAttemptAction(resultId: string) {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccessForResult(profile.id, resultId))) {
    redirect("/student/subscription?upgrade=1");
  }

  await attempts.submitAttempt(resultId, profile.id);
  redirect(`/student/exam/attempt/${resultId}/results`);
}
