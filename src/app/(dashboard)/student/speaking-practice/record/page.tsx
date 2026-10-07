import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getAllowance, getPractice } from "@/lib/speaking-audio/practice";
import { loadStudioTopics } from "@/lib/speaking-audio/topics";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { SpeakingStudio } from "@/components/student/speaking-audio/speaking-studio";
import type { PracticePrompt } from "@/lib/speaking-audio/studio-types";
import { isFeedbackLanguage, type SpeakingPart } from "@/lib/speaking-audio/constants";
import { untilText } from "@/lib/speaking-audio/format";

export const metadata: Metadata = { title: "Record your answer" };
// The actions of this page hand the AI assessment to a background task that runs after the response has been sent; this is the time it may take.
export const maxDuration = 120;

export default async function RecordYourAnswerPage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const { profile } = await requireStudentProfile();
  if (!(await hasActiveAccess(profile.id))) return <PremiumLockScreen feature="Speaking Practice AI" />;

  const { again } = await searchParams;
  const [allowance, topics, previous] = await Promise.all([
    getAllowance(profile.id),
    loadStudioTopics(),
    again ? getPractice({ kind: "student", studentId: profile.id }, again) : Promise.resolve(null),
  ]);

  // "Practise again": the same question, ready to be answered once more (the stored question is a copy, so it is used as the student's own).
  const initialPrompt: PracticePrompt | null = previous
    ? {
        part: previous.part as SpeakingPart,
        source: "OWN",
        topicId: null,
        questionId: null,
        question: previous.question,
        cueCardPoints: Array.isArray(previous.cueCardPoints) ? previous.cueCardPoints.filter((point): point is string => typeof point === "string") : [],
        feedbackLanguage: isFeedbackLanguage(previous.feedbackLanguage) ? previous.feedbackLanguage : "en",
      }
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Record your answer"
        description="Answer an IELTS Speaking question out loud and get an AI assessment of your fluency, vocabulary, grammar and pronunciation."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/student/speaking-practice/recordings">
              <History className="size-4" /> My recordings
            </Link>
          </Button>
        }
      />
      <SpeakingStudio
        userKey={profile.id}
        topics={topics}
        initialPrompt={initialPrompt}
        allowance={{ limit: allowance.limit, used: allowance.used, remaining: allowance.remaining, allowed: allowance.allowed, resetsAtIso: allowance.resetsAt.toISOString(), resetsInText: untilText(allowance.resetsAt) }}
      />
    </div>
  );
}
