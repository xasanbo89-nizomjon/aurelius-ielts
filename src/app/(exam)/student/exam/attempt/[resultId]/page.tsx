import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptDetail } from "@/lib/exam/attempts";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import { getBookmarkedQuestionIds } from "@/lib/bookmarks";
import { listQuestionHighlights } from "@/lib/exam/annotations";
import { getFullMockExamContext } from "@/lib/full-mock-attempts";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { examDurationSeconds, remainingSeconds } from "@/lib/exam/timing";
import { resolveExamUiMode } from "@/lib/exam/ui-mode";
import { examPreferencesCookieName, parseExamPreferences } from "@/lib/exam/ui-preferences";
import { ExamRunner } from "@/components/exam/exam-runner";

export const metadata: Metadata = { title: "Exam in progress" };

export default async function ExamAttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ resultId: string }>;
  searchParams: Promise<{ ui?: string | string[] }>;
}) {
  const { resultId } = await params;
  const { ui: uiOverride } = await searchParams;
  const { user, profile } = await requireStudentProfile();

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

  const [initialBookmarks, questionHighlights, cookieStore] = await Promise.all([
    getBookmarkedQuestionIds(
      profile.id,
      attempt.mockTest.questions.map((q) => q.id)
    ),
    listQuestionHighlights(attempt.id),
    cookies(),
  ]);

  // Inside a running Full Mock the section has the OFFICIAL length (Listening 40 min, Reading 60 min) whatever the standalone test happens to be set to, and Listening may already be in its 2-minute transfer time.
  const fullMock = await getFullMockExamContext(attempt.id, profile.id);

  // Worked out ONCE, here: computing it in the client component from Date.now() gave the server render and the browser's hydration different numbers (React hydration error #418).
  const durationMinutes = fullMock?.durationMinutes ?? attempt.mockTest.durationMinutes;
  // Anchored on the server's start time. No usable duration (null, 0, not a number) = untimed: no countdown, never an auto-submit.
  const initialRemainingSeconds = remainingSeconds({ startedAt: attempt.startedAt, allowedSeconds: examDurationSeconds(durationMinutes) });

  return (
    <ExamRunner
      resultId={attempt.id}
      testTitle={attempt.mockTest.title}
      testType={attempt.mockTest.type === "LISTENING" ? "LISTENING" : "READING"}
      // Phase G — the Reading screen: official (default) or the legacy one, from NEXT_PUBLIC_EXAM_UI (or ?ui= for this visit). Same attempt, same data, same autosave either way.
      ui={resolveExamUiMode(uiOverride)}
      candidateName={user.name ?? ""}
      preferenceKey={profile.id}
      initialPreferences={parseExamPreferences(cookieStore.get(examPreferencesCookieName(profile.id))?.value)}
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
      initialRemainingSeconds={initialRemainingSeconds}
      // Phase I - the official Listening screen follows the recording by how long ago the test started on the SERVER (one number worked out here, like the clock above).
      listeningElapsedSeconds={Math.max(0, (Date.now() - attempt.startedAt.getTime()) / 1000)}
      listeningTimed={examDurationSeconds(durationMinutes) != null}
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
        groupId: question.questionGroupId,
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
        note: highlight.note,
      }))}
      initialQuestionHighlights={questionHighlights.map((highlight) => ({
        id: highlight.id,
        questionId: highlight.questionId,
        region: highlight.region,
        text: highlight.text,
        startOffset: highlight.startOffset,
        endOffset: highlight.endOffset,
        note: highlight.note,
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
