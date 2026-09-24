import type { Metadata } from "next";
import { ClipboardCheck, Mic, Newspaper, PenLine } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getWhatsNewFeed } from "@/lib/whats-new";
import { recordLoginAndGetStreak } from "@/lib/login-streak";
import { getStudentSuccessSummary } from "@/lib/analytics/student-success";
import { getWalletSummary } from "@/lib/coins";
import { getSubscriptionSummary } from "@/lib/subscription";
import { getWeeklyActivityBreakdown } from "@/lib/study-activity";
import { PageHeader } from "@/components/dashboard/page-header";
import { HomeHubCard } from "@/components/dashboard/home-hub-card";
import { WhatsNewSection } from "@/components/dashboard/whats-new-section";
import { MobileDashboardWidgets } from "@/components/student/mobile-dashboard-widgets";

export const metadata: Metadata = { title: "Home" };

export default async function StudentDashboardPage() {
  const { user, profile } = await requireStudentProfile();
  const [whatsNew, streakCount, success, wallet, subscription, weeklyActivity] = await Promise.all([
    getWhatsNewFeed(profile.id, profile.teacherId),
    recordLoginAndGetStreak(user.id),
    getStudentSuccessSummary(profile.id),
    getWalletSummary(profile.id),
    getSubscriptionSummary(profile.id),
    getWeeklyActivityBreakdown(profile.id),
  ]);

  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="What would you like to study today?"
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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

      <WhatsNewSection items={whatsNew} />
    </>
  );
}
