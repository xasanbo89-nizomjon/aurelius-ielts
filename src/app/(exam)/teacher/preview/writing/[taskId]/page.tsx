import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scopeFor } from "@/lib/exam/test-access";
import { taskImageFromRow } from "@/lib/writing-task-image";
import type { WritingExamPart } from "@/lib/writing/exam-part";
import { WritingPreview } from "@/components/teacher/writing-preview";

export const metadata: Metadata = { title: "Preview" };

/**
 * Phase L2 - "Preview as student" for a Writing task. A task made together with another (a Writing test: same bundle id) is previewed as the two parts
 * of one paper, Task 1 then Task 2; any other task is a single part. No submission or draft is created.
 */
export default async function PreviewWritingPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const { profile } = await requireTeacherProfile();

  const select = { id: true, title: true, taskNumber: true, prompt: true, visualDescription: true, bundleId: true, imageMediaFileId: true, imageUrl: true, imageType: true, imageWidth: true, imageHeight: true, imageMediaFile: { select: { id: true, path: true, mimeType: true, width: true, height: true } } } as const;
  const task = await prisma.writingTask.findFirst({ where: { id: taskId, ...scopeFor(profile) }, select });
  if (!task) notFound();
  const siblings = task.bundleId ? await prisma.writingTask.findMany({ where: { bundleId: task.bundleId, ...scopeFor(profile) }, orderBy: { taskNumber: "asc" }, select }) : [task];

  const parts: WritingExamPart[] = siblings.map((row) => {
    const image = taskImageFromRow(row);
    return {
      taskId: row.id,
      taskNumber: row.taskNumber,
      prompt: row.prompt,
      image: image ? { url: image.url, width: image.width, height: image.height } : null,
      visualDescription: row.visualDescription,
      submissionId: null,
      content: "",
      updatedAt: null,
    };
  });

  return <WritingPreview label={siblings.length > 1 ? task.title.replace(/ - Task [12]$/, "") : task.title} exitHref="/teacher/writing" parts={parts} />;
}
