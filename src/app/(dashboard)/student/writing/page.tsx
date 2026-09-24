import type { Metadata } from "next";
import Link from "next/link";
import { History, ListChecks, PenLine, Plus, TrendingDown, TrendingUp, Minus, Gauge, Trophy, Clock, FileCheck } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getStudentSubmissions, getWritingAnalytics, getOrGenerateRecommendation } from "@/lib/ai/writing";
import { getOrGeneratePractice } from "@/lib/ai/writing-practice";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { WritingSubmissionsTable } from "@/components/student/writing-submissions-table";
import { WritingRecommendationCard } from "@/components/student/writing-recommendation-card";
import { WritingPracticeCard } from "@/components/student/writing-practice-card";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";

export const metadata: Metadata = { title: "Writing Center" };

const RECENT_ESSAYS_LIMIT = 5;

const TREND_META = {
  IMPROVING: { label: "Improving", icon: TrendingUp, className: "text-success" },
  DECLINING: { label: "Declining", icon: TrendingDown, className: "text-destructive" },
  STABLE: { label: "Stable", icon: Minus, className: "text-muted-foreground" },
  NOT_ENOUGH_DATA: { label: "Not enough data", icon: Minus, className: "text-muted-foreground" },
} as const;

export default async function WritingCenterPage() {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="Writing" />;
  }

  const [submissions, analytics, recommendation, practice] = await Promise.all([
    getStudentSubmissions(profile.id),
    getWritingAnalytics(profile.id),
    getOrGenerateRecommendation(profile.id, profile.teacherId),
    getOrGeneratePractice(profile.id, profile.teacherId),
  ]);

  const recent = submissions.slice(0, RECENT_ESSAYS_LIMIT);
  const trend = TREND_META[analytics.trend];
  const TrendIcon = trend.icon;

  return (
    <>
      <PageHeader
        title="Writing Center"
        description="Practice IELTS Task 1 and Task 2, get instant AI feedback, and track your progress."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/student/writing/tasks">
                <ListChecks className="size-4" /> Assignments
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/student/writing/history">
                <History className="size-4" /> History
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/student/writing/new">
                <Plus className="size-4" /> New submission
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Average Band"
          value={analytics.averageBand != null ? analytics.averageBand.toFixed(1) : "—"}
          icon={Gauge}
          caption={analytics.averageBand == null ? "Submit an essay to get started" : "Across all analyzed essays"}
        />
        <StatCard
          label="Best Band"
          value={analytics.bestBand != null ? analytics.bestBand.toFixed(1) : "—"}
          icon={Trophy}
        />
        <StatCard
          label="Latest Band"
          value={analytics.latestBand != null ? analytics.latestBand.toFixed(1) : "—"}
          icon={Clock}
        />
        <StatCard
          label="Essays Submitted"
          value={String(analytics.essaysSubmitted)}
          icon={FileCheck}
          caption={
            <span className={cn("flex items-center gap-1", trend.className)}>
              <TrendIcon className="size-3" /> {trend.label}
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WritingRecommendationCard result={recommendation} />
        <WritingPracticeCard result={practice} />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium tracking-tight">Recent Essays</h2>
          {submissions.length > RECENT_ESSAYS_LIMIT && (
            <Link href="/student/writing/history" className="text-accent text-xs font-medium hover:underline">
              View all {submissions.length}
            </Link>
          )}
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title="No submissions yet"
            description="Submit your first Task 1 or Task 2 response to get AI feedback."
            action={
              <Button asChild size="sm">
                <Link href="/student/writing/new">
                  <Plus className="size-4" /> New submission
                </Link>
              </Button>
            }
          />
        ) : (
          <WritingSubmissionsTable submissions={recent} />
        )}
      </section>
    </>
  );
}
