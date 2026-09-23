import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Gauge, BookOpen, Headphones, CalendarClock } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import {
  getStudentPerformanceProfile,
  getTestHistoryForStudent,
  getWeaknessAnalysis,
  getBandTrend,
  getStudentInsights,
  type BandTrendRange,
} from "@/lib/analytics/band-conversation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { TestHistoryTable } from "@/components/analytics/test-history-table";
import { WeaknessAnalysisCard } from "@/components/analytics/weakness-analysis-card";
import { BandTrendCharts } from "@/components/analytics/band-trend-chart";
import { StudentInsightsCard } from "@/components/analytics/student-insights-card";

export const metadata: Metadata = { title: "Student Performance" };

const VALID_RANGES: BandTrendRange[] = ["7d", "30d", "all"];

export default async function StudentPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { profile } = await requireTeacherProfile();
  const { studentId } = await params;
  const { range: rangeParam } = await searchParams;
  const range: BandTrendRange = VALID_RANGES.includes(rangeParam as BandTrendRange) ? (rangeParam as BandTrendRange) : "all";

  const student = await getStudentPerformanceProfile(profile.id, studentId);
  if (!student) notFound();

  const [testHistory, weaknesses, trend, insights] = await Promise.all([
    getTestHistoryForStudent(studentId),
    getWeaknessAnalysis(studentId),
    getBandTrend(studentId, range),
    getStudentInsights(studentId),
  ]);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/teacher/band-conversation">
          <ArrowLeft className="size-4" /> Back to Band Conversation
        </Link>
      </Button>

      <PageHeader title={student.name ?? "Student"} description={student.email} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Registered"
          value={student.registeredAt.toLocaleDateString()}
          icon={CalendarClock}
        />
        <StatCard
          label="Last Login"
          value={student.lastLogin ? student.lastLogin.toLocaleDateString() : "Never"}
          icon={CalendarClock}
        />
        <StatCard label="Tests Completed" value={String(student.totalTestsCompleted)} icon={ClipboardCheck} />
        <StatCard
          label="Overall Estimated Band"
          value={student.overallEstimatedBand != null ? student.overallEstimatedBand.toFixed(1) : "—"}
          icon={Gauge}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Reading Average Band"
          value={student.readingAvgBand != null ? student.readingAvgBand.toFixed(1) : "—"}
          icon={BookOpen}
        />
        <StatCard
          label="Listening Average Band"
          value={student.listeningAvgBand != null ? student.listeningAvgBand.toFixed(1) : "—"}
          icon={Headphones}
        />
      </div>

      <StudentInsightsCard insights={insights} />

      <BandTrendCharts studentId={studentId} trend={trend} range={range} />

      <WeaknessAnalysisCard analysis={weaknesses} />

      <TestHistoryTable studentId={studentId} rows={testHistory} />
    </>
  );
}
