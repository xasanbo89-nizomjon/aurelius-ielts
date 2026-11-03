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
import { WelcomeHero } from "@/components/dashboard/welcome-hero";
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
      {/* Central Floating Welcome Panel with Adaptive Glassmorphism */}
      <WelcomeHero
        firstName={firstName}
        actions={premium.isPremium ? <PremiumBadge size="lg" /> : undefined}
      />

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

      {/* The Four Cards: Balanced 2x2 Grid with True Low-Opacity Glassmorphism */}
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
