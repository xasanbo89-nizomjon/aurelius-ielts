"use client";

import { useRouter } from "next/navigation";

import { SpeakingRecorder } from "@/components/student/speaking-recorder";

/** Reuses the real Speaking recorder/evaluation pipeline as-is; only the post-submit destination differs — straight back to the Full Mock orchestrator instead of the standalone Speaking result page. */
export function FullMockSpeakingRecorder({ taskId, attemptId }: { taskId: string; attemptId: string }) {
  const router = useRouter();
  return <SpeakingRecorder taskId={taskId} onSubmitted={() => router.push(`/student/full-mock/attempt/${attemptId}`)} />;
}
