import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Gauge, Percent, Timer, Users } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getMockTestAnalytics, getQuestionAnalytics } from "@/lib/analytics/teacher-insights";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { QuestionAnalyticsTable } from "@/components/analytics/question-analytics-table";

export const metadata: Metadata = { title: "Test Analytics" };

export default async function TestAnalyticsPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = await params;
  const { profile } = await requireTeacherProfile();

  const [mockTestAnalytics, questionAnalytics] = await Promise.all([
    getMockTestAnalytics(testId, profile.id),
    getQuestionAnalytics(testId, profile.id),
  ]);

  if (!mockTestAnalytics || !questionAnalytics) notFound();

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 -mb-2 w-fit">
        <Link href={`/teacher/tests/${testId}`}>
          <ArrowLeft className="size-4" /> Back to test
        </Link>
      </Button>

      <PageHeader title={`${mockTestAnalytics.title} — Analytics`} description="Real performance data from every attempt at this test." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Students" value={String(mockTestAnalytics.studentCount)} icon={Users} />
        <StatCard
          label="Average Score"
          value={mockTestAnalytics.avgScorePercent != null ? `${mockTestAnalytics.avgScorePercent}%` : "—"}
          icon={Percent}
        />
        <StatCard
          label="Average Band"
          value={mockTestAnalytics.avgBand != null ? mockTestAnalytics.avgBand.toFixed(1) : "—"}
          icon={Gauge}
        />
        <StatCard
          label="Completion Rate"
          value={mockTestAnalytics.completionRate != null ? `${mockTestAnalytics.completionRate}%` : "—"}
          icon={CheckCircle2}
          caption={`${mockTestAnalytics.completedAttempts} of ${mockTestAnalytics.totalAttempts} attempts`}
        />
        <StatCard
          label="Avg. Completion Time"
          value={mockTestAnalytics.avgDurationSeconds != null ? `${Math.round(mockTestAnalytics.avgDurationSeconds / 60)} min` : "—"}
          icon={Timer}
        />
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Question Analytics</h2>
        <QuestionAnalyticsTable questions={questionAnalytics} />
      </section>
    </>
  );
}
