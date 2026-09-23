import type { Metadata } from "next";
import Link from "next/link";
import {
  Headphones,
  BookOpen,
  PenLine,
  ClipboardCheck,
  Gauge,
  Target,
  AlertCircle,
  BookOpenCheck,
  BookMarked,
  Flame,
  Coins,
  Award,
} from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import {
  getStudentOverview,
  getSkillBreakdown,
  getRecentActivity,
  getUpcomingTasks,
} from "@/lib/dashboard-data";
import { getSubscriptionSummary } from "@/lib/subscription";
import { getCompletedArticleCount } from "@/lib/reading-progress";
import { getStudentVocabularyStats } from "@/lib/vocabulary";
import { getWordOfTheDay } from "@/lib/ai/vocabulary-assistant";
import { getWalletSummary } from "@/lib/coins";
import { getStreakSummary } from "@/lib/streaks";
import { prisma } from "@/lib/prisma";
import { SKILL_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { SkillCard } from "@/components/dashboard/skill-card";
import { ProgressSection } from "@/components/dashboard/progress-section";
import { WeaknessTracker } from "@/components/dashboard/weakness-tracker";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { UpcomingTasks } from "@/components/dashboard/upcoming-tasks";
import { TrialStatusBanner } from "@/components/dashboard/trial-status-banner";
import { RecentVocabulary } from "@/components/dashboard/recent-vocabulary";
import { WordOfTheDay } from "@/components/dashboard/word-of-the-day";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Home" };

export default async function StudentDashboardPage() {
  const { user, profile } = await requireStudentProfile();

  const [
    overview,
    skillBreakdown,
    recentActivity,
    upcomingTasks,
    subscriptionSummary,
    articlesCompleted,
    vocabularyStats,
    wordOfTheDay,
    wallet,
    streak,
    goalTarget,
    unlockedAchievementCount,
  ] = await Promise.all([
    getStudentOverview(profile.id),
    getSkillBreakdown(profile.id),
    getRecentActivity(profile.id),
    getUpcomingTasks(profile.id),
    getSubscriptionSummary(profile.id),
    getCompletedArticleCount(profile.id),
    getStudentVocabularyStats(profile.id),
    getWordOfTheDay(profile.id),
    getWalletSummary(profile.id),
    getStreakSummary(profile.id),
    prisma.studentProfile.findUnique({ where: { id: profile.id }, select: { targetBandScore: true } }),
    prisma.achievementUnlock.count({ where: { studentId: profile.id } }),
  ]);

  const goalProgressPercent =
    goalTarget?.targetBandScore != null && overview.bandScore != null && goalTarget.targetBandScore > 0
      ? Math.min(100, Math.round((overview.bandScore / goalTarget.targetBandScore) * 100))
      : null;

  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="Here's where your IELTS preparation stands today."
      />

      <TrialStatusBanner summary={subscriptionSummary} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Band Score"
          value={overview.bandScore != null ? overview.bandScore.toFixed(1) : "0.0"}
          icon={Gauge}
          caption={overview.bandScore == null ? "Complete a test to get scored" : "Average across scored skills"}
        />
        <StatCard
          label="Tests Completed"
          value={String(overview.testsCompleted)}
          icon={ClipboardCheck}
          caption={overview.testsCompleted === 0 ? "No tests taken yet" : "Total completed attempts"}
        />
        <StatCard
          label="Progress"
          value={`${overview.progressPercent}%`}
          icon={Target}
          caption="Skills practiced at least once"
        />
        <StatCard
          label="Weakness Tracker"
          value={overview.weakestSkill ? SKILL_LABELS[overview.weakestSkill] : "Not enough data"}
          valueClassName={overview.weakestSkill ? undefined : "text-xl"}
          icon={AlertCircle}
          caption={overview.weakestSkill ? "Your lowest scoring skill" : "Complete at least 2 scored tests"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Articles Completed"
          value={String(articlesCompleted)}
          icon={BookOpenCheck}
          caption={articlesCompleted === 0 ? "No articles finished yet" : "Read to the end"}
        />
        <StatCard
          label="Vocabulary Size"
          value={String(vocabularyStats.total)}
          icon={BookMarked}
          caption={vocabularyStats.total === 0 ? "No words saved yet" : `${vocabularyStats.known} known · ${vocabularyStats.learning} learning`}
        />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium tracking-tight">Motivation</h2>
          <Link href="/student/profile" className="text-accent text-xs font-medium hover:underline">
            View full profile
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Goal Progress"
            value={goalProgressPercent != null ? `${goalProgressPercent}%` : "—"}
            icon={Target}
            caption={goalTarget?.targetBandScore != null ? `Target: ${goalTarget.targetBandScore.toFixed(1)}` : "Set a target band"}
          />
          <StatCard
            label="Current Streak"
            value={String(streak.currentStreak)}
            icon={Flame}
            caption={streak.currentStreak > 0 ? "days in a row" : "Study today to start one"}
          />
          <StatCard label="Coins" value={String(wallet.balance)} icon={Coins} caption={`+${wallet.todayCoins} today`} />
          <StatCard label="Achievements" value={String(unlockedAchievementCount)} icon={Award} caption="Unlocked so far" />
        </div>
        {!subscriptionSummary.isPremium && (
          <div className="border-border/70 bg-secondary/30 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">Earn coins through real study activity and redeem 1000 for 30 days of Premium.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/student/profile">Go to Coin Wallet</Link>
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Practice</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SkillCard
            title="Listening"
            description="Sharpen comprehension with audio-based question sets."
            href="/student/listening"
            icon={Headphones}
          />
          <SkillCard
            title="Reading"
            description="Work through academic and general passages against the clock."
            href="/student/reading"
            icon={BookOpen}
          />
          <SkillCard
            title="Writing"
            description="Draft Task 1 and Task 2 responses for teacher review."
            href="/student/writing"
            icon={PenLine}
          />
          <SkillCard
            title="Full Mock Test"
            description="Sit the complete exam under real timing conditions."
            href="/student/mock-test"
            icon={ClipboardCheck}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ProgressSection breakdown={skillBreakdown} />
        <WeaknessTracker breakdown={skillBreakdown} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <RecentActivity items={recentActivity} />
        <UpcomingTasks tasks={upcomingTasks} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <RecentVocabulary words={vocabularyStats.recentlyLearned} />
        <WordOfTheDay word={wordOfTheDay} />
      </div>
    </>
  );
}
