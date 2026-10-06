import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Gauge, Percent, Timer, Users } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getMockTestAnalytics } from "@/lib/analytics/teacher-insights";
import { studentScope } from "@/lib/exam/test-access";
import { getBandDistribution, getQuestionAnalysis, getResultsOverview, getStudentRows, mostMissed } from "@/lib/analytics/results-analysis";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ResultsAnalysisView } from "@/components/analytics/results-analysis-view";

export const metadata: Metadata = { title: "Test Analytics" };

export default async function TestAnalyticsPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const { testId } = await params;
  const { profile } = await requireTeacherProfile();

  const mockTestAnalytics = await getMockTestAnalytics(testId, profile.id);
  if (!mockTestAnalytics) notFound();

  // Phase M - question by question, from the stored marks of the teacher's own students' attempts (a Root Teacher: every student's).
  const filter = { ...studentScope(profile), testId };
  const [overview, bands, analysis, students] = await Promise.all([getResultsOverview(filter), getBandDistribution(filter), getQuestionAnalysis(filter), getStudentRows(filter)]);

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

      <ResultsAnalysisView
        overview={overview}
        bands={bands}
        accuracy={analysis.accuracy}
        questions={mostMissed(analysis.questions, 10)}
        allQuestions={analysis.questions}
        students={students}
        showSummary={false}
        emptyHint="None of your students has finished this test yet."
      />
    </>
  );
}
