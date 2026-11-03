"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Newspaper, PenLine } from "lucide-react";

import { getStudentDashboardData, type StudentDashboardData } from "@/actions/student-dashboard.actions";
import { WelcomeHero } from "@/components/dashboard/welcome-hero";
import { HomeHubCard } from "@/components/dashboard/home-hub-card";
import { SpeakingHubCard } from "@/components/dashboard/speaking-hub-card";
import { WhatsNewSection } from "@/components/dashboard/whats-new-section";
import { MobileDashboardWidgets } from "@/components/student/mobile-dashboard-widgets";
import { PremiumSummaryCard } from "@/components/student/premium-summary-card";
import { PremiumBadge } from "@/components/student/premium-badge";
import { ReadingStatsWidget } from "@/components/student/reading-stats-widget";
import { SpeakingPracticeWidget } from "@/components/student/speaking-practice-widget";

const INITIAL_DASHBOARD_DATA: StudentDashboardData = {
  firstName: "Xasan",
  whatsNew: [],
  streakCount: 0,
  success: {
    currentEstimate: null,
    targetBand: null,
    gap: null,
    testsCompleted: 0,
    weeklyProgress: { currentAvg: null, priorAvg: null, delta: null },
    monthlyProgress: { currentAvg: null, priorAvg: null, delta: null },
    trend: "NOT_ENOUGH_DATA",
    goalProgressPercent: null,
    estimatedCompletionDate: null,
  },
  subscription: {
    subscription: {
      id: "",
      studentId: "",
      status: "EXPIRED",
      startDate: new Date(0),
      endDate: new Date(0),
      planId: null,
      source: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    status: "EXPIRED",
    daysRemaining: null,
    hasAccess: false,
    isPremium: false,
  },
  weeklyActivity: [],
  readingStats: {
    articlesRead: 0,
    totalReadingTimeSeconds: 0,
    wordsSaved: 0,
    highlightsCreated: 0,
    readingStreak: 0,
  },
  speakingStats: {
    practiceCount: 0,
    averageBand: null,
    bestBand: null,
    weakestSkill: null,
    lastPracticeDate: null,
  },
  premium: {
    isPremium: false,
    planName: null,
    expiresAt: null,
    daysRemaining: null,
  },
  studyStreak: {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    streakFreezeUsedAt: null,
  },
};

export default function StudentDashboardPage() {
  const [data, setData] = useState<StudentDashboardData>(INITIAL_DASHBOARD_DATA);

  useEffect(() => {
    let active = true;
    getStudentDashboardData().then((result) => {
      if (active && result) {
        setData(result);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex w-full flex-col gap-6 sm:gap-8">
      {/* Central Floating Welcome Panel with Adaptive Glassmorphism */}
      <WelcomeHero
        firstName={data.firstName}
        actions={data.premium.isPremium ? <PremiumBadge size="lg" /> : undefined}
      />

      {/* Mobile-only stats bar */}
      <MobileDashboardWidgets
        targetBand={data.success.targetBand}
        goalProgressPercent={data.success.goalProgressPercent}
        isPremium={data.subscription.isPremium}
        premiumDaysRemaining={data.subscription.isPremium ? data.subscription.daysRemaining : null}
        streakCount={data.streakCount}
        weeklyActivity={data.weeklyActivity}
      />

      {/* Clean Centered "Free Plan / Upgrade to Premium" Bar */}
      <PremiumSummaryCard
        isPremium={data.premium.isPremium}
        planName={data.premium.planName}
        daysRemaining={data.premium.daysRemaining}
        currentStreak={data.studyStreak.currentStreak}
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
      <ReadingStatsWidget stats={data.readingStats} />
      <SpeakingPracticeWidget stats={data.speakingStats} />
      <WhatsNewSection items={data.whatsNew} />
    </div>
  );
}
