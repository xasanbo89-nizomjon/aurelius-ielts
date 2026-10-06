import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { scopeFor } from "@/lib/exam/test-access";
import { getTestEditState } from "@/lib/exam/test-lock";
import { getTestVersionInfo } from "@/lib/exam/test-versions";
import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { setTestCoverImageAction } from "@/actions/test-management.actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TestRowActions } from "@/components/teacher/test-row-actions";
import { EditTestDetailsDialog } from "@/components/teacher/edit-test-details-dialog";
import { PassagesManager } from "@/components/teacher/passages-manager";
import { QuestionsManager } from "@/components/teacher/questions-manager";
import { ContentCoverImageUploader } from "@/components/teacher/content-cover-image-uploader";
import { TestLockNotice } from "@/components/teacher/test-lock-notice";
import { TestVersionsPanel } from "@/components/teacher/test-versions-panel";

export const metadata: Metadata = { title: "Edit Test" };

export default async function TestEditorPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = await params;
  const { profile } = await requireTeacherProfile();

  const test = await prisma.mockTest.findFirst({
    where: { id: testId, ...scopeFor(profile) },
    include: {
      passages: {
        orderBy: { orderIndex: "asc" },
        include: {
          attachments: { orderBy: { orderIndex: "asc" } },
          // Phase 50.1 — fetched in the same single query as everything else, no N+1: one round trip for the whole editor.
          questionGroups: { orderBy: { orderIndex: "asc" } },
        },
      },
      questions: { orderBy: { orderIndex: "asc" } },
      _count: { select: { results: true } },
      fullMockReadingUses: { select: { fullMockTest: { select: { title: true } } } },
      fullMockListeningUses: { select: { fullMockTest: { select: { title: true } } } },
      packageFullMockTest: { select: { title: true } },
    },
  });

  if (!test) notFound();

  const testType = test.type === "LISTENING" ? "LISTENING" : "READING";
  // Phase L1 - what may still be changed (published / attempted / in a live Full Mock tests are read-only) and where this test sits among its versions.
  const [editState, versionInfo] = await Promise.all([getTestEditState(test.id), getTestVersionInfo(test.id)]);

  return (
    <>
      <PageHeader
        title={test.title}
        description={`${testType === "LISTENING" ? "Listening" : "Reading"} module`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={test.isArchived ? "outline" : test.isPublished ? "success" : "outline"}>
              {test.isArchived ? "Archived" : test.isPublished ? "Published" : "Draft"}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={`/teacher/tests/${test.id}/analytics`}>
                <BarChart3 className="size-4" /> Analytics
              </Link>
            </Button>
            <EditTestDetailsDialog
              testId={test.id}
              title={test.title}
              description={test.description}
              durationMinutes={test.durationMinutes}
            />
            <TestRowActions
              testId={test.id}
              isPublished={test.isPublished}
              isArchived={test.isArchived}
              attemptCount={test._count.results}
              ownerMockTitle={test.packageFullMockTest?.title ?? null}
              usedInFullMocks={[...new Set([...test.fullMockReadingUses, ...test.fullMockListeningUses].map((use) => use.fullMockTest.title))]}
              redirectAfterDelete="/teacher/tests"
            />
          </div>
        }
      />

      <span id="test-top" />

      {test.description && <p className="text-muted-foreground -mt-4 text-sm">{test.description}</p>}

      {!editState.editable && editState.reason && <TestLockNotice testId={test.id} reason={editState.reason} />}
      <TestVersionsPanel info={versionInfo} />

      <ContentCoverImageUploader
        initialPath={test.coverImagePath}
        action={setTestCoverImageAction.bind(null, test.id)}
        alt={`${test.title} cover`}
      />

      {/* A disabled fieldset disables every button and field inside it: a locked test shows its content but offers no editing (the server refuses it too). */}
      <fieldset disabled={!editState.editable} className="m-0 min-w-0 space-y-6 border-0 p-0" data-locked={!editState.editable}>
      <PassagesManager testId={test.id} testType={testType} passages={test.passages} />

      <QuestionsManager
        testId={test.id}
        passages={test.passages.map((passage) => ({
          id: passage.id,
          title: passage.title,
          questionGroups: passage.questionGroups.map((group) => ({
            id: group.id,
            title: group.title,
            startQuestion: group.startQuestion,
            endQuestion: group.endQuestion,
            instructions: group.instructions,
            orderIndex: group.orderIndex,
          })),
        }))}
        questions={test.questions.map((question) => ({
          id: question.id,
          passageId: question.passageId,
          questionGroupId: question.questionGroupId,
          type: question.type,
          prompt: question.prompt,
          points: question.points,
          options: question.options,
          correctAnswer: question.correctAnswer,
        }))}
      />
      </fieldset>
    </>
  );
}
