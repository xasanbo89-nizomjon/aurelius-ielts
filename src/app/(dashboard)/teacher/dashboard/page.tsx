import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  FileText,
  PenLine,
  Gem,
  Newspaper,
  BookMarked,
  RotateCcw,
  CalendarPlus,
  History,
  Clock,
  Search,
  Trophy,
  Award,
} from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getTeacherOverview } from "@/lib/dashboard-data";
import { getTeacherArticlesOverview } from "@/lib/article-analytics";
import { getTrialAnalytics } from "@/lib/trial-management";
import { getTeacherVocabularyIntelligence, getVocabularyLeaderboard } from "@/lib/analytics/teacher-vocabulary-insights";
import { formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

const TRIAL_ACTION_LABEL = { TRIAL_RESET_90: "Reset 90-day trial", TRIAL_EXTEND_30: "Extended +30 days" } as const;

export const metadata: Metadata = { title: "Overview" };

export default async function TeacherDashboardPage() {
  const { user, profile } = await requireTeacherProfile();
  const isRoot = profile.isRootTeacher;

  const [overview, articlesOverview, trialAnalytics, vocabularyIntelligence, vocabularyLeaderboard] = await Promise.all([
    getTeacherOverview(profile.id),
    getTeacherArticlesOverview(profile.id),
    isRoot ? getTrialAnalytics() : Promise.resolve(null),
    getTeacherVocabularyIntelligence(profile.id),
    getVocabularyLeaderboard(profile.id),
  ]);

  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="A real-time snapshot of your students, tests and pending reviews."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Published Articles"
          value={String(articlesOverview.publishedCount)}
          icon={Newspaper}
          caption={articlesOverview.publishedCount === 0 ? "No articles published yet" : "Live for your students"}
        />
        <StatCard
          label="Article Readers"
          value={String(articlesOverview.totalReaders)}
          icon={Users}
          caption={`${articlesOverview.totalViews} total views`}
        />
        <StatCard
          label="Vocabulary Activity"
          value={String(articlesOverview.vocabularyActivity)}
          icon={BookMarked}
          caption="Words highlighted across your articles"
        />
      </div>

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

      {isRoot && trialAnalytics && (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-medium tracking-tight">Trial Management</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Trial Resets" value={String(trialAnalytics.totalResets)} icon={RotateCcw} />
            <StatCard label="Total Trial Extensions" value={String(trialAnalytics.totalExtensions)} icon={CalendarPlus} />
            <StatCard
              label="Last Trial Action"
              value={trialAnalytics.lastActionAt ? formatRelativeTime(trialAnalytics.lastActionAt) : "—"}
              icon={Clock}
              valueClassName={trialAnalytics.lastActionAt ? "text-xl" : undefined}
              caption={trialAnalytics.lastActionAt ? trialAnalytics.lastActionAt.toLocaleDateString() : "No actions yet"}
            />
            <StatCard
              label="Recent Actions"
              value={String(trialAnalytics.recentActions.length)}
              icon={History}
              caption="Shown below"
            />
          </div>

          {trialAnalytics.recentActions.length === 0 ? (
            <EmptyState
              icon={History}
              title="No trial actions yet"
              description="Resets and extensions you perform from the Students page will show up here."
            />
          ) : (
            <Card className="gap-0 py-2">
              <CardContent className="divide-border/70 divide-y px-0">
                {trialAnalytics.recentActions.map((action) => (
                  <div key={action.id} className="flex items-center justify-between gap-4 px-6 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{action.studentName ?? action.studentEmail}</p>
                      <p className="text-muted-foreground text-xs">
                        {action.newExpiryDate.toLocaleDateString()}
                        {action.previousExpiryDate && ` (was ${action.previousExpiryDate.toLocaleDateString()})`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={action.action === "TRIAL_RESET_90" ? "accent" : "success"}>
                        {TRIAL_ACTION_LABEL[action.action]}
                      </Badge>
                      <span className="text-muted-foreground text-xs">{formatRelativeTime(action.at)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </>
  );
}
