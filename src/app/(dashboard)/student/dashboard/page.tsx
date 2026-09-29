import type { Metadata } from "next";
import { ClipboardCheck, Mic, Newspaper, PenLine } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getWhatsNewFeed } from "@/lib/whats-new";
import { recordLoginAndGetStreak } from "@/lib/login-streak";
import { getStudentSuccessSummary } from "@/lib/analytics/student-success";
import { getWalletSummary, awardDailyLoginCoins } from "@/lib/coins";
import { getSubscriptionSummary } from "@/lib/subscription";
import { getWeeklyActivityBreakdown } from "@/lib/study-activity";
import { getStudentReadingStats } from "@/lib/reading-analytics";
import { getSpeakingPracticeStats } from "@/lib/speaking-practice";
import { getPremiumIdentity } from "@/lib/premium-identity";
import { getStreakSummary } from "@/lib/streaks";
import { PageHeader } from "@/components/dashboard/page-header";
import { HomeHubCard } from "@/components/dashboard/home-hub-card";
import { WhatsNewSection } from "@/components/dashboard/whats-new-section";
import { MobileDashboardWidgets } from "@/components/student/mobile-dashboard-widgets";
import { PremiumSummaryCard } from "@/components/student/premium-summary-card";
import { PremiumBadge } from "@/components/student/premium-badge";
import { ReadingStatsWidget } from "@/components/student/reading-stats-widget";
import { SpeakingPracticeWidget } from "@/components/student/speaking-practice-widget";

export const metadata: Metadata = { title: "Home" };

export default async function StudentDashboardPage() {
  const { user, profile } = await requireStudentProfile();

  // Phase 39 — Part 4's daily login reward. Idempotent per calendar day
  // (awardCoins), so it's safe to run on every dashboard visit.
  await awardDailyLoginCoins(profile.id);

  const [whatsNew, streakCount, success, wallet, subscription, weeklyActivity, readingStats, speakingStats, premium, studyStreak] =
    await Promise.all([
      getWhatsNewFeed(profile.id, profile.teacherId),
      recordLoginAndGetStreak(user.id),
      getStudentSuccessSummary(profile.id),
      getWalletSummary(profile.id),
      getSubscriptionSummary(profile.id),
      getWeeklyActivityBreakdown(profile.id),
      getStudentReadingStats(profile.id),
      getSpeakingPracticeStats(profile.id),
      getPremiumIdentity(profile.id),
      getStreakSummary(profile.id),
    ]);

  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="What would you like to study today?"
        actions={premium.isPremium ? <PremiumBadge size="lg" /> : undefined}
      />

      <MobileDashboardWidgets
        targetBand={success.targetBand}
        goalProgressPercent={success.goalProgressPercent}
        coinBalance={wallet.balance}
        isPremium={subscription.isPremium}
        premiumDaysRemaining={subscription.isPremium ? subscription.daysRemaining : null}
        streakCount={streakCount}
        weeklyActivity={weeklyActivity}
      />

      <PremiumSummaryCard
        isPremium={premium.isPremium}
        planName={premium.planName}
        daysRemaining={premium.daysRemaining}
        currentStreak={studyStreak.currentStreak}
        coinBalance={wallet.balance}
      />

      <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-2">
        <HomeHubCard
          title="Tests"
          description="Reading, Listening and Full Mock practice under real exam conditions."
          href="/student/tests"
          icon={ClipboardCheck}
        />
        <HomeHubCard
          title="Leveled Articles"
          description="Read passages matched to your level and build vocabulary as you go."
          href="/student/articles"
          icon={Newspaper}
        />
        <HomeHubCard
          title="Writing"
          description="Submit Task 1 and Task 2 essays assigned by your teacher for review."
          href="/student/writing"
          icon={PenLine}
        />
        <HomeHubCard
          title="Speaking"
          description="Practice your speaking skills for the IELTS exam."
          href="/student/speaking"
          icon={Mic}
        />
      </div>

      <ReadingStatsWidget stats={readingStats} />

      <SpeakingPracticeWidget stats={speakingStats} />

      <WhatsNewSection items={whatsNew} />
    </>
  );
}
