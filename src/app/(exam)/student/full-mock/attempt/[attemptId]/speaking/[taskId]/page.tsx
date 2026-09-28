import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { getFullMockProgressSummary, getFullMockSpeakingTask } from "@/lib/full-mock-attempts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FullMockSpeakingRecorder } from "./full-mock-speaking-recorder";

export const metadata: Metadata = { title: "Full Mock — Speaking" };

const PART_LABEL: Record<number, string> = { 1: "Part 1 — Introduction & Interview", 2: "Part 2 — Long Turn", 3: "Part 3 — Discussion" };

export default async function FullMockSpeakingLegPage({
  params,
}: {
  params: Promise<{ attemptId: string; taskId: string }>;
}) {
  const { attemptId, taskId } = await params;
  const { profile } = await requireStudentProfile();

  const [task, progress] = await Promise.all([
    getFullMockSpeakingTask(attemptId, profile.id, taskId),
    getFullMockProgressSummary(attemptId, profile.id),
  ]);
  if (!task) notFound();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12 sm:py-16">
      {progress && (
        <p className="text-muted-foreground mb-4 text-center text-xs">
          {progress.completedCount}/{progress.totalCount} sections complete · ~{progress.estimatedMinutesRemaining} min remaining
        </p>
      )}
      <Card>
        <CardHeader>
          <Badge variant="outline" className="w-fit">
            {PART_LABEL[task.part] ?? `Part ${task.part}`}
          </Badge>
          <CardTitle>{task.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm whitespace-pre-wrap">{task.prompt}</p>
          <FullMockSpeakingRecorder taskId={task.id} attemptId={attemptId} />
        </CardContent>
      </Card>
    </div>
  );
}
