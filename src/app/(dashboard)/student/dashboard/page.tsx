import type { Metadata } from "next";
import { ClipboardCheck, Newspaper, PenLine } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getWhatsNewFeed } from "@/lib/whats-new";
import { recordLoginAndGetStreak } from "@/lib/login-streak";
import { getStudentSuccessSummary } from "@/lib/analytics/student-success";
import { getSubscriptionSummary } from "@/lib/subscription";
import { getWeeklyActivityBreakdown } from "@/lib/study-activity";
import { getStudentReadingStats } from "@/lib/reading-analytics";
import { getSpeakingPracticeStats } from "@/lib/speaking-practice";
import { getPremiumIdentity } from "@/lib/premium-identity";
import { getStreakSummary } from "@/lib/streaks";
import { HomeHubCard } from "@/components/dashboard/home-hub-card";
import { SpeakingHubCard } from "@/components/dashboard/speaking-hub-card";
import { WhatsNewSection } from "@/components/dashboard/whats-new-section";
import { MobileDashboardWidgets } from "@/components/student/mobile-dashboard-widgets";
import { PremiumSummaryCard } from "@/components/student/premium-summary-card";
import { PremiumBadge } from "@/components/student/premium-badge";
import { ReadingStatsWidget } from "@/components/student/reading-stats-widget";
import { SpeakingPracticeWidget } from "@/components/student/speaking-practice-widget";

export const metadata: Metadata = { title: "Home — Aurelius IELTS" };

export default async function StudentDashboardPage() {
  const { user, profile } = await requireStudentProfile();

  const [
    whatsNew,
    streakCount,
    success,
    subscription,
    weeklyActivity,
    readingStats,
    speakingStats,
    premium,
    studyStreak,
  ] = await Promise.all([
    getWhatsNewFeed(profile.id, profile.teacherId),
    recordLoginAndGetStreak(user.id),
    getStudentSuccessSummary(profile.id),
    getSubscriptionSummary(profile.id),
    getWeeklyActivityBreakdown(profile.id),
    getStudentReadingStats(profile.id),
    getSpeakingPracticeStats(profile.id),
    getPremiumIdentity(profile.id),
    getStreakSummary(profile.id),
  ]);

  const firstName = user.name?.trim().split(/\s+/)[0] || "Xasan";

  return (
    <div className="flex w-full flex-col gap-6 sm:gap-8">
      {/* Central Floating Welcome Panel with Ultra-Translucent Glassmorphism */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-500/20 bg-[#131622]/30 p-6 sm:p-8 backdrop-blur-xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]">
        {/* Soft, vibrant ambient glows that blend with the background nebula */}
        <div className="pointer-events-none absolute -left-12 -top-12 size-52 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 -bottom-12 size-52 rounded-full bg-amber-500/15 blur-3xl" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200/95 via-amber-100/90 to-amber-200/85 drop-shadow-[0_2px_12px_rgba(245,158,11,0.22)]">
              Welcome back, {firstName}
            </h1>
            <p className="text-sm sm:text-base text-amber-200/75 font-normal">
              What would you like to study today?
            </p>
          </div>

          {premium.isPremium && (
            <div className="shrink-0">
              <PremiumBadge size="lg" />
            </div>
          )}
        </div>
      </div>

      {/* Mobile-only stats bar */}
      <MobileDashboardWidgets
        targetBand={success.targetBand}
        goalProgressPercent={success.goalProgressPercent}
        isPremium={subscription.isPremium}
        premiumDaysRemaining={subscription.isPremium ? subscription.daysRemaining : null}
        streakCount={streakCount}
        weeklyActivity={weeklyActivity}
      />

      {/* Clean Centered "Free Plan / Upgrade to Premium" Bar */}
      <PremiumSummaryCard
        isPremium={premium.isPremium}
        planName={premium.planName}
        daysRemaining={premium.daysRemaining}
        currentStreak={studyStreak.currentStreak}
      />

      {/* The Four Cards: Balanced 2x2 Grid with Low-Opacity Glassmorphism */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
        {/* Top-Left: Tests */}
        <HomeHubCard
          title="Tests"
          description="Reading, Listening and Full Mock practice under real exam conditions."
          href="/student/tests"
          icon={ClipboardCheck}
        />

        {/* Top-Right: Leveled Articles */}
        <HomeHubCard
          title="Leveled Articles"
          description="Read passages matched to your level and build vocabulary as you go."
          href="/student/articles"
          icon={Newspaper}
        />

        {/* Bottom-Left: Writing */}
        <HomeHubCard
          title="Writing"
          description="Submit Task 1 and Task 2 essays assigned by your teacher for review."
          href="/student/writing"
          icon={PenLine}
        />

        {/* Bottom-Right: Speaking with Integrated Custom Question Input */}
        <SpeakingHubCard
          title="Speaking"
          description="Practice your speaking skills for the IELTS exam."
          href="/student/speaking-practice"
        />
      </div>

      {/* Secondary widgets */}
      <ReadingStatsWidget stats={readingStats} />
      <SpeakingPracticeWidget stats={speakingStats} />
      <WhatsNewSection items={whatsNew} />
    </div>
  );
}
