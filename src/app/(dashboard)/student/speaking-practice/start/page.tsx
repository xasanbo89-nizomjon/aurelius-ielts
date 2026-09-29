import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStudentProfile } from "@/lib/session";
import { createSpeakingAttempt, getMixedSpeakingPractice, getRandomSpeakingPrompt } from "@/lib/speaking-practice";
import type { SpeakingPracticePartValue } from "@/lib/validations/speaking-practice";

export const metadata: Metadata = { title: "Starting Practice…" };

const VALID_PARTS: SpeakingPracticePartValue[] = ["PART_1", "PART_2", "PART_3"];

/**
 * Resolves a real random prompt (or, for Mixed, one per part), creates the
 * real attempt row(s), and redirects straight into the answer workspace —
 * same "do the write during render, then redirect" pattern as the Full
 * Mock Test orchestrator (Phase 34).
 */
export default async function StartSpeakingPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ part?: string }>;
}) {
  const { profile } = await requireStudentProfile();
  const { part } = await searchParams;

  if (part === "MIXED") {
    const prompts = await getMixedSpeakingPractice();
    if (prompts.length === 0) redirect("/student/speaking-practice?error=no-content");

    const attempts = await Promise.all(
      prompts.map((p) => createSpeakingAttempt(profile.id, { topicId: p.topicId, questionId: p.questionId, part: p.part }))
    );
    const [first, ...rest] = attempts;
    const sequence = rest.map((a) => a.id).join(",");
    redirect(`/student/speaking-practice/attempt/${first.id}${sequence ? `?sequence=${sequence}` : ""}`);
  }

  if (!part || !VALID_PARTS.includes(part as SpeakingPracticePartValue)) {
    redirect("/student/speaking-practice");
  }

  const prompt = await getRandomSpeakingPrompt(part as SpeakingPracticePartValue);
  if (!prompt) redirect("/student/speaking-practice?error=no-content");

  const attempt = await createSpeakingAttempt(profile.id, { topicId: prompt.topicId, questionId: prompt.questionId, part: prompt.part });
  redirect(`/student/speaking-practice/attempt/${attempt.id}`);
}
