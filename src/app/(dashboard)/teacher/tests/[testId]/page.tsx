import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, Eye, Highlighter } from "lucide-react";

import { scopeFor } from "@/lib/exam/test-access";
import { getEvidenceCoverageForTest } from "@/lib/exam/answer-evidence-server";
import { getTestEditState } from "@/lib/exam/test-lock";
import { getTestVersionInfo } from "@/lib/exam/test-versions";
import { getBuilderState } from "@/lib/exam/test-builder";
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
import { TestBuilder } from "@/components/teacher/test-builder/test-builder";

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
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      isPublished: true,
      isArchived: true,
      durationMinutes: true,
      coverImagePath: true,
      _count: { select: { results: true } },
      fullMockReadingUses: { select: { fullMockTest: { select: { title: true } } } },
      fullMockListeningUses: { select: { fullMockTest: { select: { title: true } } } },
      packageFullMockTest: { select: { title: true } },
    },
  });

  if (!test) notFound();

  const testType = test.type === "LISTENING" ? "LISTENING" : "READING";
  // Phase L1 - what may still be changed (published / attempted / in a live Full Mock tests are read-only) and where this test sits among its versions.
  const [editState, versionInfo, evidence] = await Promise.all([getTestEditState(test.id), getTestVersionInfo(test.id), getEvidenceCoverageForTest(test.id)]);

  // Phase L2 - a test that may still be changed opens in the structured editor; a locked one shows its content read-only, as before.
  const editable = editState.editable && (test.type === "READING" || test.type === "LISTENING");
  const builder = editable ? await getBuilderState(test.id, profile.id) : null;
  const readOnly = editable
    ? null
    : await prisma.mockTest.findUnique({
        where: { id: test.id },
        select: {
          passages: { orderBy: { orderIndex: "asc" }, include: { attachments: { orderBy: { orderIndex: "asc" } }, questionGroups: { orderBy: { orderIndex: "asc" } } } },
          questions: { orderBy: { orderIndex: "asc" } },
        },
      });

  return (
    <>
      <PageHeader
        title={test.title}
        description={`${testType === "LISTENING" ? "Listening" : "Reading"} module`}
        actions={
          <div className="flex items-center gap-2">
            {(versionInfo.versionOf || versionInfo.newerVersions.length > 0) && (
              <Badge variant="outline" data-testid="version-badge">
                v{versionInfo.versionNumber}
              </Badge>
            )}
            <Badge variant={test.isArchived ? "outline" : test.isPublished ? "success" : "outline"}>
              {test.isArchived ? "Archived" : test.isPublished ? "Published" : "Draft"}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={`/teacher/tests/${test.id}/analytics`}>
                <BarChart3 className="size-4" /> Analytics
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/teacher/tests/${test.id}/evidence`} data-testid="evidence-link">
                <Highlighter className="size-4" /> Answer evidence{evidence.total > 0 ? ` (${evidence.confirmed}/${evidence.total})` : ""}
              </Link>
            </Button>
            {!builder && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/teacher/preview/${test.id}`} target="_blank" data-testid="preview-link">
                  <Eye className="size-4" /> Preview as student
                </Link>
              </Button>
            )}
            {!builder && <EditTestDetailsDialog testId={test.id} title={test.title} description={test.description} durationMinutes={test.durationMinutes} />}
            <TestRowActions
              testId={test.id}
              isPublished={test.isPublished}
              isArchived={test.isArchived}
              attemptCount={test._count.results}
              ownerMockTitle={test.packageFullMockTest?.title ?? null}
              usedInFullMocks={[...new Set([...test.fullMockReadingUses, ...test.fullMockListeningUses].map((use) => use.fullMockTest.title))]}
              redirectAfterDelete="/teacher/tests"
              hidePublish={Boolean(builder)}
              isNewVersion={Boolean(versionInfo.versionOf)}
            />
          </div>
        }
      />

      <span id="test-top" />

      {!editState.editable && editState.reason && <TestLockNotice testId={test.id} reason={editState.reason} />}
      <TestVersionsPanel info={versionInfo} />

      {builder ? (
        <TestBuilder testId={test.id} skill={builder.skill} initialModel={builder.model} initialVersion={builder.version} initialParts={builder.parts} coverImagePath={test.coverImagePath} isNewVersion={Boolean(versionInfo.versionOf)} />
      ) : (
        readOnly && (
          <>
            {test.description && <p className="text-muted-foreground -mt-4 text-sm">{test.description}</p>}

            <ContentCoverImageUploader initialPath={test.coverImagePath} action={setTestCoverImageAction.bind(null, test.id)} alt={`${test.title} cover`} />

            {/* A disabled fieldset disables every button and field inside it: a locked test shows its content but offers no editing (the server refuses it too). */}
            <fieldset disabled className="m-0 min-w-0 space-y-6 border-0 p-0" data-locked="true">
              <PassagesManager testId={test.id} testType={testType} passages={readOnly.passages} />

              <QuestionsManager
                testId={test.id}
                passages={readOnly.passages.map((passage) => ({
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
                questions={readOnly.questions.map((question) => ({
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
        )
      )}
    </>
  );
}
