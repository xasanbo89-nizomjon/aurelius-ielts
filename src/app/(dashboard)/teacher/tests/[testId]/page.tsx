import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TestRowActions } from "@/components/teacher/test-row-actions";
import { EditTestDetailsDialog } from "@/components/teacher/edit-test-details-dialog";
import { PassagesManager } from "@/components/teacher/passages-manager";
import { QuestionsManager } from "@/components/teacher/questions-manager";

export const metadata: Metadata = { title: "Edit Test" };

export default async function TestEditorPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = await params;
  const { profile } = await requireTeacherProfile();

  const test = await prisma.mockTest.findFirst({
    where: { id: testId, createdById: profile.id },
    include: {
      passages: { orderBy: { orderIndex: "asc" } },
      questions: { orderBy: { orderIndex: "asc" } },
      _count: { select: { results: true } },
    },
  });

  if (!test) notFound();

  const testType = test.type === "LISTENING" ? "LISTENING" : "READING";

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
              hasResults={test._count.results > 0}
            />
          </div>
        }
      />

      {test.description && <p className="text-muted-foreground -mt-4 text-sm">{test.description}</p>}

      <PassagesManager testId={test.id} testType={testType} passages={test.passages} />

      <QuestionsManager
        testId={test.id}
        passages={test.passages.map((passage) => ({ id: passage.id, title: passage.title }))}
        questions={test.questions.map((question) => ({
          id: question.id,
          passageId: question.passageId,
          type: question.type,
          prompt: question.prompt,
          points: question.points,
          options: question.options,
          correctAnswer: question.correctAnswer,
        }))}
      />
    </>
  );
}
