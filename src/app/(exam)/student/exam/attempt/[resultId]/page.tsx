import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { getAttemptDetail } from "@/lib/exam/attempts";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
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

  return (
    <ExamRunner
      resultId={attempt.id}
      testTitle={attempt.mockTest.title}
      testType={attempt.mockTest.type === "LISTENING" ? "LISTENING" : "READING"}
      durationMinutes={attempt.mockTest.durationMinutes}
      startedAt={attempt.startedAt.toISOString()}
      passages={attempt.mockTest.passages.map((passage) => ({
        id: passage.id,
        title: passage.title,
        content: passage.content,
        audioUrl: resolvePassageAudioSrc(passage),
        orderIndex: passage.orderIndex,
      }))}
      questions={attempt.mockTest.questions.map((question) => ({
        id: question.id,
        passageId: question.passageId,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
        orderIndex: question.orderIndex,
      }))}
      initialAnswers={initialAnswers}
      initialFlags={initialFlags}
      initialHighlights={attempt.highlights.map((highlight) => ({
        id: highlight.id,
        passageId: highlight.passageId,
        text: highlight.text,
        startOffset: highlight.startOffset,
        endOffset: highlight.endOffset,
      }))}
      initialNotes={attempt.notes.map((note) => ({
        id: note.id,
        passageId: note.passageId,
        content: note.content,
      }))}
    />
  );
}
