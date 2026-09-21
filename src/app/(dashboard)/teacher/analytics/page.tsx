import type { Metadata } from "next";
import { Users, Gauge, ClipboardCheck, CheckCircle2 } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getTeacherOverview } from "@/lib/dashboard-data";
import {
  getCompletionStatistics,
  getStudentProgressList,
  getTestPerformanceList,
} from "@/lib/analytics/teacher-insights";
import { getDailyExplanationLimit } from "@/lib/ai/explanations";
import { getMostConfusingQuestions, getMostRequestedExplanations } from "@/lib/ai/teacher-insights";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { StudentProgressTable } from "@/components/analytics/student-progress-table";
import { TestPerformanceTable } from "@/components/analytics/test-performance-table";
import { MostRequestedExplanationsTable } from "@/components/analytics/most-requested-explanations-table";
import { MostConfusingQuestionsTable } from "@/components/analytics/most-confusing-questions-table";
import { AiSettingsCard } from "@/components/teacher/ai-settings-card";

export const metadata: Metadata = { title: "Analytics" };

export default async function TeacherAnalyticsPage() {
  const { profile } = await requireTeacherProfile();

  const [overview, bandAggregate, completion, students, tests, dailyLimit, mostRequested, mostConfusing] =
    await Promise.all([
      getTeacherOverview(profile.id),
      prisma.result.aggregate({
        where: { student: { teacherId: profile.id }, bandScore: { not: null } },
        _avg: { bandScore: true },
      }),
      getCompletionStatistics(profile.id),
      getStudentProgressList(profile.id),
      getTestPerformanceList(profile.id),
      getDailyExplanationLimit(profile.id),
      getMostRequestedExplanations(profile.id),
      getMostConfusingQuestions(profile.id),
    ]);

  const averageBand = bandAggregate._avg.bandScore;

  return (
    <>
      <PageHeader title="Analytics" description="Aggregate performance across every student you teach." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={String(overview.studentCount)} icon={Users} />
        <StatCard
          label="Average Band Score"
          value={averageBand != null ? averageBand.toFixed(1) : "—"}
          icon={Gauge}
          caption={averageBand == null ? "No scored tests yet" : "Across all completed tests"}
        />
        <StatCard label="Tests Completed" value={String(completion.completed)} icon={ClipboardCheck} />
        <StatCard
          label="Completion Rate"
          value={completion.completionRate != null ? `${completion.completionRate}%` : "—"}
          icon={CheckCircle2}
          caption={
            completion.started === 0
              ? "No attempts yet"
              : `${completion.completed} of ${completion.started} attempts finished`
          }
        />
      </div>

      <StudentProgressTable students={students} />

      <TestPerformanceTable tests={tests} />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-medium tracking-tight">AI Explain More</h2>
          <p className="text-muted-foreground text-sm">Real usage of the AI explanation feature across your tests.</p>
        </div>

        <AiSettingsCard dailyLimit={dailyLimit} />

        <MostRequestedExplanationsTable rows={mostRequested} />

        <MostConfusingQuestionsTable rows={mostConfusing} />
      </section>
    </>
  );
}
