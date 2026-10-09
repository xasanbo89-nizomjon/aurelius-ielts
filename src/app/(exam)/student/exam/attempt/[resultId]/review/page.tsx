import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptSummary } from "@/lib/exam/attempts";
import { getResultVisibility, hiddenAttemptHref } from "@/lib/exam/result-visibility";
import { findInProgressFullMockLinkForResult } from "@/lib/full-mock-attempts";
import { officialBandForScore } from "@/lib/analytics/band-conversion";
import { isCustomFormat } from "@/lib/exam/test-format";
import { reanchorHighlight } from "@/lib/exam/text-highlight";
import { confirmedEvidenceRanges } from "@/lib/exam/review-model";
import { getApprovedExplanations } from "@/lib/exam/question-explanations-server";
import { hasActiveAccess } from "@/lib/subscription";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import { examPreferencesCookieName, parseExamPreferences } from "@/lib/exam/ui-preferences";
import { OfficialReview, type ReviewPassageHighlight, type ReviewScreenQuestion } from "@/components/exam/official/official-review";

export const metadata: Metadata = { title: "Review Answers" };

/**
 * Phase M2 - the review of a finished Reading or Listening test, drawn in the official exam layout (read-only): the band and raw score in a dialog when the
 * student has just handed in (`?results=1`), then every question green or red with its answer, the evidence in the passage, the student's own highlights and
 * notes, and the explanations a teacher approved. Everything shown is what was stored when the attempt was handed in - nothing here is marked again, and
 * nothing here calls the AI (a student never triggers a call: see question-explanations.ts).
 */
/** The stored explanation as the review gets it: the text for a student who may read it, otherwise only which pills exist. */
function reviewExplanation(parts: { explain: string | null; trap: string | null; fix: string | null } | null, canExplain: boolean): ReviewScreenQuestion["explanation"] {
  if (!parts) return null;
  if (canExplain) return parts;
  return { explain: null, trap: null, fix: null, locked: true, has: { explain: !!parts.explain, trap: !!(parts.trap || parts.fix) } };
}

export default async function ExamReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ resultId: string }>;
  searchParams: Promise<{ results?: string | string[] }>;
}) {
  const { resultId } = await params;
  const { results } = await searchParams;
  const { user, profile } = await requireStudentProfile();

  // Phase O - the outcome is checked on the server before anything is read: a hidden result (or a Full Mock section) sends the student on, never to a page with a score.
  const visibility = await getResultVisibility(resultId, profile.id);
  if (!visibility.found) notFound();
  if (visibility.completed && !visibility.shown) redirect(hiddenAttemptHref(resultId, visibility));

  const attempt = await getAttemptSummary(resultId, profile.id);
  if (!attempt) notFound();
  if (!attempt.completedAt) redirect(`/student/exam/attempt/${resultId}`);
  // A Full Mock section is not marked between papers - see the results page.
  const fullMockAttemptId = await findInProgressFullMockLinkForResult(resultId);
  if (fullMockAttemptId) redirect(`/student/full-mock/attempt/${fullMockAttemptId}`);

  const [cookieStore, explanations, canExplain] = await Promise.all([cookies(), getApprovedExplanations(attempt.mockTest.questions), hasActiveAccess(profile.id)]);

  const totalPoints = attempt.mockTest.questions.reduce((sum, question) => sum + question.points, 0);
  // Phase Q - a Custom test has no band: the review shows its score and percentage instead.
  const custom = isCustomFormat(attempt.mockTest.testFormat);
  const band = custom ? null : (attempt.bandScore ?? officialBandForScore(attempt.skill, attempt.rawScore ?? 0, totalPoints));

  const answerByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  const passageContent = new Map(attempt.mockTest.passages.map((passage) => [passage.id, passage.content]));

  const questions: ReviewScreenQuestion[] = attempt.mockTest.questions.map((question) => {
    const answer = answerByQuestion.get(question.id);
    return {
      id: question.id,
      passageId: question.passageId,
      groupId: question.questionGroupId,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      correctAnswer: question.correctAnswer,
      orderIndex: question.orderIndex,
      studentAnswer: answer?.response ?? null,
      // What the attempt was scored with, so the review always agrees with the stored score (Phase L1).
      verdict: answer ? { isCorrect: answer.isCorrect, pointsAwarded: answer.pointsAwarded, points: question.points } : null,
      // Only what a teacher CONFIRMED reaches a student (Phase M).
      evidence: confirmedEvidenceRanges(question.evidence, passageContent),
      highlights: attempt.questionHighlights
        .filter((highlight) => highlight.questionId === question.id)
        .map((highlight) => ({ id: highlight.id, questionId: highlight.questionId, region: highlight.region, text: highlight.text, startOffset: highlight.startOffset, endOffset: highlight.endOffset, note: highlight.note })),
      // Phase M3 - a student whose plan does not include "AI Explain More" gets NO text, only the fact that there is one (the pills then open the Premium prompt).
      explanation: reviewExplanation(explanations.get(question.id) ?? null, canExplain),
    };
  });

  // Highlights saved by the old engine were shifted by the passage's paragraph labels: put each back on the words it was made on (new ones pass through unchanged).
  const passageHighlights: ReviewPassageHighlight[] = attempt.highlights.flatMap((highlight) => {
    const content = passageContent.get(highlight.passageId);
    const range = content == null ? null : reanchorHighlight(content, highlight);
    return range ? [{ id: highlight.id, passageId: highlight.passageId, start: range.start, end: range.end, note: highlight.note }] : [];
  });

  return (
    <OfficialReview
      resultId={resultId}
      testType={attempt.skill === "LISTENING" ? "LISTENING" : "READING"}
      candidateName={user.name ?? ""}
      preferencesCookieName={examPreferencesCookieName(profile.id)}
      initialPreferences={parseExamPreferences(cookieStore.get(examPreferencesCookieName(profile.id))?.value)}
      band={band}
      custom={custom}
      rawScore={attempt.rawScore ?? 0}
      totalPoints={totalPoints}
      passages={attempt.mockTest.passages.map((passage) => ({
        id: passage.id,
        title: passage.title,
        content: passage.content,
        audioUrl: resolvePassageAudioSrc(passage),
        audioStartSeconds: passage.audioStartSeconds,
        orderIndex: passage.orderIndex,
        attachments: passage.attachments.map((attachment) => ({ id: attachment.id, type: attachment.type, imagePath: attachment.imagePath, caption: attachment.caption })),
      }))}
      groups={attempt.mockTest.passages.flatMap((passage) =>
        passage.questionGroups.map((group) => ({
          id: group.id,
          passageId: group.passageId,
          startQuestion: group.startQuestion,
          endQuestion: group.endQuestion,
          title: group.title,
          instructions: group.instructions,
          orderIndex: group.orderIndex,
        }))
      )}
      questions={questions}
      passageHighlights={passageHighlights}
      notes={attempt.notes.map((note) => ({ id: note.id, passageId: note.passageId, content: note.content }))}
      openResults={(Array.isArray(results) ? results[0] : results) === "1"}
      exitHref="/student/dashboard"
    />
  );
}
