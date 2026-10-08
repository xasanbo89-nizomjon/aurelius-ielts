"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import * as attempts from "@/lib/exam/attempts";
import * as annotations from "@/lib/exam/annotations";
import { hasActiveAccess, hasActiveAccessForTest, hasActiveAccessForResult } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { finishedAttemptHref, resultShownToStudentWhere } from "@/lib/exam/result-visibility";
import { findInProgressFullMockLinkForResult, markListeningAudioEnded } from "@/lib/full-mock-attempts";
import { generateWrongAnswerExplanation } from "@/lib/ai/services/explain-wrong-answer";
import type { ExplainWrongAnswerResponse } from "@/lib/ai/prompts/explain-wrong-answer";
import { AIServiceUnavailableError } from "@/lib/ai/errors";

export type ActionResult = { success: true } | { success: false; error: string };

/** `ended`: the attempt is over for good (its time ran out on the server, or a teacher ended it) - the screen takes the student on instead of retrying. */
export type SaveAnswerResult = { success: true } | { success: false; error: string; ended?: boolean };

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

    // Phase O - a result the teacher chose to hide (or a Full Mock section) is "not found" here: no explanation, hence no hint of which answers were wrong.
    const result = await prisma.result.findFirst({
      where: { id: resultId, studentId: profile.id, completedAt: { not: null }, ...resultShownToStudentWhere },
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
): Promise<SaveAnswerResult> {
  try {
    const { profile } = await requireStudentProfile();
    await attempts.saveAnswer(resultId, profile.id, questionId, response);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save your answer.", ended: error instanceof attempts.AttemptEndedError };
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

/** Phase 41 — real last-seen-question persistence for cross-refresh recovery. Fire-and-forget from the client; never blocks navigation. */
export async function updateLastSeenQuestionAction(resultId: string, questionId: string): Promise<void> {
  const { profile } = await requireStudentProfile();
  await attempts.updateLastSeenQuestion(resultId, profile.id, questionId);
}

export async function addHighlightAction(
  resultId: string,
  input: { passageId: string; text: string; startOffset: number; endOffset: number; color?: "YELLOW" | "BLUE" | "GREEN" }
): Promise<ActionResult & { highlightId?: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const highlight = await annotations.addHighlight(resultId, profile.id, input);
    return { success: true, highlightId: highlight.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save highlight." };
  }
}

/** Phase D — one highlighting step (highlight / merge / clear / remove) as a single atomic write. See annotations.applyHighlightChange. */
export async function applyHighlightChangeAction(
  resultId: string,
  change: annotations.HighlightChange
): Promise<{ success: true; ids: string[] } | { success: false; error: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const ids = await annotations.applyHighlightChange(resultId, profile.id, change);
    return { success: true, ids };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save highlight." };
  }
}

export async function addQuestionHighlightAction(
  resultId: string,
  input: { questionId: string; part: string; text: string; startOffset: number; endOffset: number }
): Promise<ActionResult & { highlightId?: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const highlight = await annotations.addQuestionHighlight(resultId, profile.id, input);
    return { success: true, highlightId: highlight.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save highlight." };
  }
}

export async function removeQuestionHighlightAction(resultId: string, highlightId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.removeQuestionHighlight(resultId, profile.id, highlightId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not remove highlight." };
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

  try {
    await attempts.submitAttempt(resultId, profile.id);
  } catch (error) {
    // Phase K - the server may have finalised the attempt already (its time ran out while the browser was offline, or a teacher ended the
    // section): then there is nothing left to hand in and the student simply carries on to whatever comes next.
    const done = await prisma.result.findFirst({ where: { id: resultId, studentId: profile.id, completedAt: { not: null } }, select: { id: true } });
    if (!done) throw error;
  }

  // Inside a Full Mock the sitting carries straight on: the next screen is the "ready" screen for the next section (Listening finished → Start Reading; Reading completed → Start Writing), not this section's marks.
  const fullMockAttemptId = await findInProgressFullMockLinkForResult(resultId);
  if (fullMockAttemptId) redirect(`/student/full-mock/attempt/${fullMockAttemptId}/transition`);
  // Phase M2 - straight to the review, which opens with the results dialog (band, raw score, every answer); the older results page stays reachable from the history.
  // Phase O - unless the teacher chose to hide this test's results: then only "Your test has been submitted."
  redirect(await finishedAttemptHref(resultId, profile.id));
}

/**
 * Phase E — the Listening recording has finished playing: start the
 * 2-minute transfer time (recorded once, server-side). Returns the seconds
 * left so the page can show the right countdown even if this is a repeat call.
 */
export async function markListeningAudioEndedAction(
  attemptId: string
): Promise<{ success: true; transferSecondsRemaining: number } | { success: false }> {
  try {
    const { profile } = await requireStudentProfile();
    const marked = await markListeningAudioEnded(attemptId, profile.id);
    return marked ? { success: true, transferSecondsRemaining: marked.transferSecondsRemaining } : { success: false };
  } catch {
    return { success: false };
  }
}
