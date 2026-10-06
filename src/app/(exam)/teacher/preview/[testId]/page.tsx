import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scopeFor } from "@/lib/exam/test-access";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { resolveExamUiMode } from "@/lib/exam/ui-mode";
import { examPreferencesCookieName, parseExamPreferences } from "@/lib/exam/ui-preferences";
import { ExamRunner } from "@/components/exam/exam-runner";
import { ExamPreviewShell } from "@/components/teacher/exam-preview-shell";

export const metadata: Metadata = { title: "Preview" };

/**
 * Phase L2 - "Preview as student" for a Reading or Listening test (a draft or a published one): the REAL exam runner, given the test's own rows exactly the way
 * the attempt page gives them to a student, but with no attempt behind it - nothing is created and the runner's writes go nowhere (ExamPreviewShell).
 * Untimed, so it never hands itself in; a Listening recording plays from its beginning each time the page opens.
 */
export default async function PreviewTestPage({ params, searchParams }: { params: Promise<{ testId: string }>; searchParams: Promise<{ ui?: string | string[] }> }) {
  const { testId } = await params;
  const { ui: uiOverride } = await searchParams;
  const { user, profile } = await requireTeacherProfile();

  const test = await prisma.mockTest.findFirst({
    where: { id: testId, ...scopeFor(profile), type: { in: ["READING", "LISTENING"] } },
    include: {
      passages: { orderBy: { orderIndex: "asc" }, include: { attachments: { orderBy: { orderIndex: "asc" } }, questionGroups: { orderBy: [{ orderIndex: "asc" }, { startQuestion: "asc" }] } } },
      questions: { orderBy: { orderIndex: "asc" } },
    },
  });
  if (!test) notFound();

  const cookieStore = await cookies();
  const exitHref = `/teacher/tests/${test.id}`;

  return (
    <ExamPreviewShell exitHref={exitHref} label={test.title}>
      <ExamRunner
        resultId={`preview-${test.id}`}
        testTitle={test.title}
        testType={test.type === "LISTENING" ? "LISTENING" : "READING"}
        ui={resolveExamUiMode(uiOverride)}
        candidateName={user.name ? `${user.name} (preview)` : "Preview"}
        preferenceKey={profile.id}
        initialPreferences={parseExamPreferences(cookieStore.get(examPreferencesCookieName(profile.id))?.value)}
        groups={test.passages.flatMap((passage) =>
          passage.questionGroups.map((group) => ({ id: group.id, passageId: group.passageId, startQuestion: group.startQuestion, endQuestion: group.endQuestion, title: group.title, instructions: group.instructions, orderIndex: group.orderIndex }))
        )}
        initialRemainingSeconds={null}
        listeningElapsedSeconds={0}
        listeningTimed={false}
        fullMock={null}
        passages={test.passages.map((passage) => ({
          id: passage.id,
          title: passage.title,
          content: passage.content,
          audioUrl: resolvePassageAudioSrc(passage),
          audioStartSeconds: passage.audioStartSeconds,
          orderIndex: passage.orderIndex,
          attachments: passage.attachments.map((attachment) => ({ id: attachment.id, type: attachment.type, imagePath: attachment.imagePath, caption: attachment.caption })),
        }))}
        questions={test.questions.map((question) => ({
          id: question.id,
          passageId: question.passageId,
          groupId: question.questionGroupId,
          type: question.type,
          prompt: question.prompt,
          options: question.options,
          orderIndex: question.orderIndex,
          // Only the KEYS of a summary's answer (so every number gets an answer box) - never the answers themselves.
          blankKeys: question.type === "SUMMARY_COMPLETION" ? answerKeysOf(question.correctAnswer) : null,
        }))}
        initialAnswers={{}}
        initialFlags={[]}
        initialBookmarks={[]}
        initialHighlights={[]}
        initialQuestionHighlights={[]}
        initialNotes={[]}
        initialLastSeenQuestionId={null}
      />
    </ExamPreviewShell>
  );
}
