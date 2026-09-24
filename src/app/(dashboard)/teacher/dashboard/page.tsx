import type { Metadata } from "next";
import Link from "next/link";
import { Users, FileText, PenLine, Gem, BookMarked, Search, Trophy, Award, AlertTriangle } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getTeacherOverview } from "@/lib/dashboard-data";
import { getTeacherVocabularyIntelligence, getVocabularyLeaderboard, getMostSearchedWords } from "@/lib/analytics/teacher-vocabulary-insights";
import { getAtRiskStudents } from "@/lib/analytics/at-risk-students";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Overview" };

export default async function TeacherDashboardPage() {
  const { user, profile } = await requireTeacherProfile();

  const [overview, vocabularyIntelligence, vocabularyLeaderboard, atRiskStudents, mostSearchedWords] = await Promise.all([
    getTeacherOverview(profile.id),
    getTeacherVocabularyIntelligence(profile.id),
    getVocabularyLeaderboard(profile.id),
    getAtRiskStudents(profile.id),
    getMostSearchedWords(profile.id),
  ]);

  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="A real-time snapshot of your students, tests and pending reviews."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Students"
          value={String(overview.studentCount)}
          icon={Users}
          caption={overview.studentCount === 0 ? "No students yet" : "Enrolled students"}
        />
        <StatCard
          label="Tests"
          value={String(overview.testCount)}
          icon={FileText}
          caption={`${overview.publishedTestCount} published`}
        />
        <StatCard
          label="Active Subscriptions"
          value={String(overview.activeSubscriptions)}
          icon={Gem}
          caption={overview.activeSubscriptions === 0 ? "No active plans yet" : "Currently active"}
        />
        <StatCard
          label="Writing Reviews"
          value={String(overview.pendingWritingReviews)}
          icon={PenLine}
          caption={overview.pendingWritingReviews === 0 ? "All caught up" : "Awaiting your feedback"}
        />
      </div>

      <section className="space-y-4">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          <AlertTriangle className="text-destructive size-5" aria-hidden="true" /> At Risk Students
        </h2>
        {atRiskStudents.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No students at risk right now"
            description="Students with dropping streaks, declining scores, or no recent activity will show up here."
          />
        ) : (
          <div className="space-y-3">
            {atRiskStudents.map((student) => (
              <Card key={student.studentId} className="border-destructive/20">
                <CardContent className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <Link href={`/teacher/students/${student.studentId}`} className="text-sm font-medium hover:underline">
                      {student.name ?? student.email}
                    </Link>
                    <div className="flex flex-wrap gap-1.5">
                      {student.reasons.map((reason) => (
                        <Badge key={reason} variant="destructive">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Vocabulary Intelligence</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Vocabulary Searches"
            value={String(vocabularyIntelligence.totalSearches)}
            icon={Search}
            caption="Every word click, including repeats"
          />
          <StatCard label="Total Unique Words" value={String(vocabularyIntelligence.totalUniqueWords)} icon={BookMarked} />
          <StatCard
            label="Most Searched Word"
            value={vocabularyIntelligence.mostSearchedWord?.word ?? "—"}
            icon={Trophy}
            caption={
              vocabularyIntelligence.mostSearchedWord ? `${vocabularyIntelligence.mostSearchedWord.count} lookups` : "No lookups yet"
            }
          />
          <StatCard
            label="Most Active Vocabulary Student"
            value={
              vocabularyIntelligence.mostActiveStudent
                ? (vocabularyIntelligence.mostActiveStudent.name ?? vocabularyIntelligence.mostActiveStudent.email)
                : "—"
            }
            valueClassName={vocabularyIntelligence.mostActiveStudent ? "text-xl" : undefined}
            icon={Award}
            caption={
              vocabularyIntelligence.mostActiveStudent ? `${vocabularyIntelligence.mostActiveStudent.searches} searches` : "No activity yet"
            }
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Top Vocabulary Learners</h2>
        {vocabularyLeaderboard.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No vocabulary searches yet"
            description="Once students start clicking words in Articles, the most active vocabulary learners will show up here."
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ranked by real vocabulary searches</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2.5">
                {vocabularyLeaderboard.map((row, index) => (
                  <li key={row.studentId} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/teacher/students/${row.studentId}`} className="min-w-0 truncate hover:underline">
                      <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
                      {row.name ?? row.email}
                    </Link>
                    <span className="text-muted-foreground shrink-0 tabular-nums">{row.searches} searches</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Most Searched Words</h2>
        {mostSearchedWords.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No word searches yet"
            description="Once students click words in Articles, the most-searched words across your class will show up here."
          />
        ) : (
          <Card>
            <CardContent>
              <ol className="space-y-2.5">
                {mostSearchedWords.map((row, index) => (
                  <li key={row.word} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground mr-2 tabular-nums">{index + 1}.</span>
                      <span className="font-medium">{row.word}</span>
                      {row.articleTitle && <span className="text-muted-foreground"> — {row.articleTitle}</span>}
                    </span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {row.searchCount} search{row.searchCount === 1 ? "" : "es"} · {row.studentCount} student{row.studentCount === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
