import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getSpeakingResultDetail } from "@/lib/speaking";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";
import { SpeakingResultCard } from "@/components/student/speaking-result-card";

export const metadata: Metadata = { title: "Speaking Result" };

export default async function StudentSpeakingResultPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="Speaking" />;
  }

  const result = await getSpeakingResultDetail(submissionId, profile.id);
  if (!result) notFound();

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/student/speaking">
          <ArrowLeft className="size-4" /> Back to Speaking
        </Link>
      </Button>

      <PageHeader title={result.taskTitle} description={`Part ${result.part}`} />

      <SpeakingResultCard result={result} />
    </>
  );
}
