import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptDetail } from "@/lib/exam/attempts";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import { getBookmarkedQuestionIds } from "@/lib/bookmarks";
import { listQuestionHighlights } from "@/lib/exam/annotations";
import { getFullMockExamContext } from "@/lib/full-mock-attempts";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { ExamRunner } from "@/components/exam/exam-runner";

export const metadata: Metadata = { title: "Exam in progress" };

export default async function ExamAttemptPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;
  const { profile } = await requireStudentProfile();

  const attempt = await getAttemptDetail(resultId, profile.id);
  if (!attempt) notFound();
  if (attempt.completedAt) redirect(`/student/exam/attempt/${resultId}/results`);

  const initialAnswers: Record<string, unknown> = {};
  for (const answer of attempt.answers) {
    initialAnswers[answer.questionId] = answer.response;
  }

  const initialFlags = Array.isArray(attempt.flaggedQuestionIds)
    ? (attempt.flaggedQuestionIds as string[])
    : [];

  const [initialBookmarks, questionHighlights] = await Promise.all([
    getBookmarkedQuestionIds(
      profile.id,
      attempt.mockTest.questions.map((q) => q.id)
    ),
    listQuestionHighlights(attempt.id),
  ]);

  // Inside a running Full Mock the section has the OFFICIAL length (Listening 40 min, Reading 60 min) whatever the standalone test happens to be set to, and Listening may already be in its 2-minute transfer time.
  const fullMock = await getFullMockExamContext(attempt.id, profile.id);

  // Worked out ONCE, here: computing it in the client component from Date.now() gave the server render and the browser's hydration different numbers (React hydration error #418).
  const durationMinutes = fullMock?.durationMinutes ?? attempt.mockTest.durationMinutes;
  const initialRemainingSeconds =
    durationMinutes == null ? null : Math.max(0, durationMinutes * 60 - Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000));

  return (
    <ExamRunner
      resultId={attempt.id}
      testTitle={attempt.mockTest.title}
      testType={attempt.mockTest.type === "LISTENING" ? "LISTENING" : "READING"}
      initialRemainingSeconds={initialRemainingSeconds}
      fullMock={fullMock ? { attemptId: fullMock.attemptId, transferSecondsRemaining: fullMock.transferSecondsRemaining } : null}
      passages={attempt.mockTest.passages.map((passage) => ({
        id: passage.id,
        title: passage.title,
        content: passage.content,
        audioUrl: resolvePassageAudioSrc(passage),
        orderIndex: passage.orderIndex,
        attachments: passage.attachments.map((attachment) => ({
          id: attachment.id,
          type: attachment.type,
          imagePath: attachment.imagePath,
          caption: attachment.caption,
        })),
      }))}
      questions={attempt.mockTest.questions.map((question) => ({
        id: question.id,
        passageId: question.passageId,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
        orderIndex: question.orderIndex,
        // Only the KEYS of a summary's answer (so every number gets an answer box) — never the answers themselves.
        blankKeys: question.type === "SUMMARY_COMPLETION" ? answerKeysOf(question.correctAnswer) : null,
      }))}
      initialAnswers={initialAnswers}
      initialFlags={initialFlags}
      initialBookmarks={initialBookmarks}
      initialHighlights={attempt.highlights.map((highlight) => ({
        id: highlight.id,
        passageId: highlight.passageId,
        text: highlight.text,
        startOffset: highlight.startOffset,
        endOffset: highlight.endOffset,
        color: highlight.color,
      }))}
      initialQuestionHighlights={questionHighlights.map((highlight) => ({
        id: highlight.id,
        questionId: highlight.questionId,
        region: highlight.region,
        text: highlight.text,
        startOffset: highlight.startOffset,
        endOffset: highlight.endOffset,
      }))}
      initialNotes={attempt.notes.map((note) => ({
        id: note.id,
        passageId: note.passageId,
        content: note.content,
      }))}
      initialLastSeenQuestionId={attempt.lastSeenQuestionId}
    />
  );
}
