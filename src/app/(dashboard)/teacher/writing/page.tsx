import type { Metadata } from "next";
import { FileCheck, Gauge, TrendingUp } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { listWritingTasksForTeacher } from "@/lib/writing-tasks";
import { getTeacherWritingAnalytics } from "@/lib/teacher-writing-analytics";
import { GRAMMAR_ISSUE_CATEGORY_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WritingTasksManager } from "@/components/teacher/writing-tasks-manager";

export const metadata: Metadata = { title: "Writing" };

export default async function TeacherWritingPage() {
  const { profile } = await requireTeacherProfile();
  const [tasks, analytics] = await Promise.all([
    listWritingTasksForTeacher(profile.id),
    getTeacherWritingAnalytics(profile.id),
  ]);

  const maxMistakeCount = analytics.mostCommonMistakes[0]?.count ?? 0;
  const maxProgressBand = Math.max(1, ...analytics.progressOverview.map((m) => m.averageBand));

  return (
    <>
      <PageHeader
        title="Writing"
        description="Task 1 and Task 2 prompts for your students' task bank, plus real writing performance across your class."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Submissions"
          value={String(analytics.totalSubmissions)}
          icon={FileCheck}
          caption={analytics.totalSubmissions === 0 ? "No submissions yet" : "Across your students"}
        />
        <StatCard
          label="Average Class Band"
          value={analytics.averageClassBand != null ? analytics.averageClassBand.toFixed(1) : "—"}
          icon={Gauge}
          caption={analytics.averageClassBand == null ? "No analyzed essays yet" : "Across all analyzed essays"}
        />
        <StatCard
          label="Tasks Published"
          value={String(tasks.filter((t) => t.status === "PUBLISHED").length)}
          icon={TrendingUp}
          caption={`${tasks.length} total in your task bank`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Common Mistakes</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.mostCommonMistakes.length === 0 ? (
              <p className="text-muted-foreground text-sm">No analyzed essays yet.</p>
            ) : (
              <div className="space-y-3">
                {analytics.mostCommonMistakes.map((mistake) => (
                  <div key={mistake.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{GRAMMAR_ISSUE_CATEGORY_LABELS[mistake.category]}</span>
                      <span className="text-muted-foreground">{mistake.count}</span>
                    </div>
                    <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-accent h-full rounded-full"
                        style={{ width: `${Math.max(4, (mistake.count / maxMistakeCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Writing Progress Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
              {analytics.progressOverview.map((month) => (
                <div key={month.monthLabel} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-muted-foreground text-xs tabular-nums">{month.count > 0 ? month.averageBand.toFixed(1) : "—"}</span>
                  <div
                    className="bg-accent/70 w-full rounded-t-md"
                    style={{ height: month.count > 0 ? `${Math.max(6, (month.averageBand / maxProgressBand) * 80)}px` : "2px" }}
                  />
                  <span className="text-muted-foreground text-[11px]">{month.monthLabel}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Task Bank</h2>
        <WritingTasksManager
          tasks={tasks.map((task) => ({
            id: task.id,
            title: task.title,
            taskNumber: task.taskNumber,
            category: task.category,
            prompt: task.prompt,
            visualDescription: task.visualDescription,
            targetBand: task.targetBand,
            dueDate: task.dueDate,
            status: task.status,
            submissionCount: task._count.submissions,
          }))}
        />
      </section>
    </>
  );
}
