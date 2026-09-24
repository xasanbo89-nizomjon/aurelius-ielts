import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Award, Gauge, TrendingDown, TrendingUp, AlertTriangle, ThumbsDown, ThumbsUp, Lightbulb, LineChart } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getSpeakingAnalyticsOverview } from "@/lib/analytics/speaking-analytics";
import { getDailySpeakingEvaluationLimit } from "@/lib/speaking";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpeakingAiSettingsCard } from "@/components/teacher/speaking-ai-settings-card";

export const metadata: Metadata = { title: "Speaking Analytics" };

export default async function TeacherSpeakingAnalyticsPage() {
  const { profile } = await requireTeacherProfile();
  const [analytics, dailyLimit] = await Promise.all([
    getSpeakingAnalyticsOverview(profile.id),
    getDailySpeakingEvaluationLimit(profile.id),
  ]);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/teacher/speaking">
          <ArrowLeft className="size-4" /> Back to Speaking Tasks
        </Link>
      </Button>

      <PageHeader title="Speaking Analytics" description="Real, platform-wide Speaking performance across your students, from AI-evaluated attempts." />

      {analytics.totalEvaluated === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No AI-evaluated Speaking attempts yet"
          description="Once your students submit Speaking recordings, real analytics will show up here."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Average Speaking Band" value={analytics.averageBand?.toFixed(1) ?? "—"} icon={Gauge} caption={`${analytics.totalEvaluated} evaluated attempts`} />
            <StatCard
              label="Best Student"
              value={analytics.bestStudent ? (analytics.bestStudent.name ?? analytics.bestStudent.email) : "—"}
              valueClassName={analytics.bestStudent ? "text-xl" : undefined}
              icon={Award}
              caption={analytics.bestStudent ? `Band ${analytics.bestStudent.avgBand.toFixed(1)} avg` : "Not enough data yet"}
            />
            <StatCard
              label="Weakest Area Platform-Wide"
              value={analytics.weakestArea?.label ?? "—"}
              valueClassName={analytics.weakestArea ? "text-lg" : undefined}
              icon={ThumbsDown}
              caption={analytics.weakestArea ? `${analytics.weakestArea.avgBand.toFixed(1)} avg band` : "Not enough data yet"}
            />
            <StatCard
              label="Strongest Area Platform-Wide"
              value={analytics.strongestArea?.label ?? "—"}
              valueClassName={analytics.strongestArea ? "text-lg" : undefined}
              icon={ThumbsUp}
              caption={analytics.strongestArea ? `${analytics.strongestArea.avgBand.toFixed(1)} avg band` : "Not enough data yet"}
            />
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <section className="space-y-4">
              <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
                <TrendingUp className="text-success size-5" aria-hidden="true" /> Most Improved Students
              </h2>
              {analytics.mostImprovedStudents.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No improvement trends yet" description="Students need at least 4 evaluated attempts before a real trend shows up here." />
              ) : (
                <Card>
                  <CardContent>
                    <ol className="space-y-2.5">
                      {analytics.mostImprovedStudents.map((row, index) => (
                        <li key={row.studentId} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
                            {row.name ?? row.email}
                          </span>
                          <span className="text-success shrink-0 tabular-nums">
                            {row.earlierAvgBand.toFixed(1)} → {row.recentAvgBand.toFixed(1)} (+{row.improvement.toFixed(1)})
                          </span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}
            </section>

            <section className="space-y-4">
              <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
                <AlertTriangle className="text-destructive size-5" aria-hidden="true" /> At-Risk Students (Speaking)
              </h2>
              {analytics.atRiskStudents.length === 0 ? (
                <EmptyState icon={AlertTriangle} title="No at-risk students right now" description="A declining trend or a low average band will show up here." />
              ) : (
                <div className="space-y-3">
                  {analytics.atRiskStudents.map((row) => (
                    <Card key={row.studentId} className="border-destructive/20">
                      <CardContent className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{row.name ?? row.email}</span>
                          <Badge variant="destructive">Band {row.avgBand.toFixed(1)}</Badge>
                        </div>
                        <p className="text-muted-foreground text-xs">{row.reason}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <section className="space-y-4">
              <h2 className="font-display text-xl font-medium tracking-tight">Most Common Weak Areas</h2>
              {analytics.commonMistakes.length === 0 ? (
                <EmptyState icon={ThumbsDown} title="Not enough data yet" description="How often each criterion is a student's own weakest area will show up here." />
              ) : (
                <Card>
                  <CardContent>
                    <ol className="space-y-2.5">
                      {analytics.commonMistakes.map((row, index) => (
                        <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
                            {row.label}
                          </span>
                          <span className="text-muted-foreground shrink-0 tabular-nums">
                            {row.count} student{row.count === 1 ? "" : "s"} ({row.percentOfSubmissions}%)
                          </span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}
            </section>

            <section className="space-y-4">
              <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
                <LineChart className="text-accent size-5" aria-hidden="true" /> Speaking Progress Trend
              </h2>
              {analytics.progressTrend.length === 0 ? (
                <EmptyState icon={TrendingDown} title="Not enough data yet" description="Weekly average Speaking band across your students will show up here." />
              ) : (
                <Card>
                  <CardContent>
                    <ol className="space-y-2.5">
                      {analytics.progressTrend.map((point) => (
                        <li key={point.weekLabel} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-muted-foreground">Week of {point.weekLabel}</span>
                          <span className="tabular-nums">
                            {point.avgBand.toFixed(1)} avg ({point.count} attempt{point.count === 1 ? "" : "s"})
                          </span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              )}
            </section>
          </div>

          <section className="space-y-4">
            <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
              <Lightbulb className="text-accent size-5" aria-hidden="true" /> AI Insights — Recommended Practice Areas
            </h2>
            {analytics.recommendedPracticeAreas.length === 0 ? (
              <EmptyState icon={Lightbulb} title="Not enough data yet" description="Platform-wide practice recommendations will show up here." />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Where to focus class time next</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {analytics.recommendedPracticeAreas.map((line, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Lightbulb className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </section>
        </>
      )}

      <SpeakingAiSettingsCard dailyLimit={dailyLimit} />
    </>
  );
}
