import type { Metadata } from "next";
import { Users, Gauge, ClipboardCheck, CheckCircle2, Trophy, TrendingDown, AlertTriangle, History } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getTeacherOverview } from "@/lib/dashboard-data";
import {
  getCompletionStatistics,
  getStudentProgressList,
  getTestPerformanceList,
  getWeakestSkill,
  getMostMissedQuestionTypes,
  getRecentAttempts,
} from "@/lib/analytics/teacher-insights";
import { getDailyExplanationLimit } from "@/lib/ai/explanations";
import { getMostConfusingQuestions, getMostRequestedExplanations } from "@/lib/ai/teacher-insights";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StudentProgressTable } from "@/components/analytics/student-progress-table";
import { TestPerformanceTable } from "@/components/analytics/test-performance-table";
import { MostRequestedExplanationsTable } from "@/components/analytics/most-requested-explanations-table";
import { MostConfusingQuestionsTable } from "@/components/analytics/most-confusing-questions-table";
import { AiSettingsCard } from "@/components/teacher/ai-settings-card";
import { AnalyticsSubNav } from "@/components/teacher/analytics-sub-nav";

export const metadata: Metadata = { title: "Analytics" };

const MIN_TESTS_FOR_BEST_STUDENT = 3;

export default async function TeacherAnalyticsPage() {
  const { profile } = await requireTeacherProfile();

  const [overview, bandAggregate, completion, students, tests, dailyLimit, mostRequested, mostConfusing, weakestSkillData, mostMissedTypes, recentAttempts] =
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
      getWeakestSkill(profile.id),
      getMostMissedQuestionTypes(profile.id),
      getRecentAttempts(profile.id),
    ]);

  const averageBand = bandAggregate._avg.bandScore;

  // Phase 44 — Part 9's "Best Student": real highest average band, only
  // among students with enough completed tests to be a meaningful signal
  // (never a single lucky attempt).
  const bestStudent = students
    .filter((s) => s.avgBand != null && s.testsCompleted >= MIN_TESTS_FOR_BEST_STUDENT)
    .reduce<(typeof students)[number] | null>((best, s) => (!best || s.avgBand! > best.avgBand! ? s : best), null);

  return (
    <>
      <PageHeader title="Analytics" description="Aggregate performance across every student you teach." />

      <AnalyticsSubNav isRootTeacher={profile.isRootTeacher} />

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Best Student"
          value={bestStudent ? (bestStudent.name ?? bestStudent.email) : "—"}
          icon={Trophy}
          caption={bestStudent ? `Band ${bestStudent.avgBand!.toFixed(1)} avg · ${bestStudent.testsCompleted} tests` : "Needs 3+ completed tests per student"}
        />
        <StatCard
          label="Weakest Skill"
          value={weakestSkillData.weakest ? weakestSkillData.weakest.label : "—"}
          icon={TrendingDown}
          caption={weakestSkillData.weakest ? `Band ${weakestSkillData.weakest.avgBand!.toFixed(1)} avg across your students` : "Not enough scored data yet"}
        />
      </div>

      <StudentProgressTable students={students} />

      <TestPerformanceTable tests={tests} />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-medium tracking-tight">Most Missed Question Types</h2>
          <p className="text-muted-foreground text-sm">Real wrong-answer rate per question type, across every test you own.</p>
        </div>
        {mostMissedTypes.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Not enough data yet" description="Once students complete more tests, the question types they miss most will show up here." />
        ) : (
          <Card className="gap-0 py-2">
            <CardContent className="divide-border/70 divide-y px-0">
              {mostMissedTypes.map((row) => (
                <div key={row.type} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                  <span className="text-destructive shrink-0 tabular-nums">{row.wrong}/{row.total} wrong</span>
                  <span className="text-muted-foreground w-12 shrink-0 text-right tabular-nums">{row.missedPercent}%</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-medium tracking-tight">Recent Attempts</h2>
          <p className="text-muted-foreground text-sm">The most recent real completed tests across every student you teach.</p>
        </div>
        {recentAttempts.length === 0 ? (
          <EmptyState icon={History} title="No completed attempts yet" description="Real student attempts will show up here as soon as they complete a test." />
        ) : (
          <Card className="gap-0 py-2">
            <CardContent className="divide-border/70 divide-y px-0">
              {recentAttempts.map((attempt) => (
                <div key={attempt.resultId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{attempt.studentName ?? attempt.studentEmail}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {attempt.testTitle} · {attempt.skill === "LISTENING" ? "Listening" : "Reading"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {attempt.bandScore != null ? `Band ${attempt.bandScore.toFixed(1)}` : "Not scored"}
                  </Badge>
                  <span className="text-muted-foreground w-20 shrink-0 text-right text-xs">{attempt.completedAt.toLocaleDateString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

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
