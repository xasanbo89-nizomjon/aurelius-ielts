"use server";

import { requireStudentProfile } from "@/lib/session";
import { getWhatsNewFeed, type WhatsNewItem } from "@/lib/whats-new";
import { recordLoginAndGetStreak } from "@/lib/login-streak";
import { getStudentSuccessSummary, type StudentSuccessSummary } from "@/lib/analytics/student-success";
import { getSubscriptionSummary, type SubscriptionSummary } from "@/lib/subscription";
import { getWeeklyActivityBreakdown, type DailyActivityPoint } from "@/lib/study-activity";
import { getStudentReadingStats, type StudentReadingStats } from "@/lib/reading-analytics";
import { getSpeakingPracticeStats, type SpeakingPracticeStats } from "@/lib/speaking-practice";
import { getPremiumIdentity, type PremiumIdentity } from "@/lib/premium-identity";
import { getStreakSummary, type StreakSummary } from "@/lib/streaks";

export interface StudentDashboardData {
  firstName: string;
  whatsNew: WhatsNewItem[];
  streakCount: number;
  success: StudentSuccessSummary;
  subscription: SubscriptionSummary;
  weeklyActivity: DailyActivityPoint[];
  readingStats: StudentReadingStats;
  speakingStats: SpeakingPracticeStats;
  premium: PremiumIdentity;
  studyStreak: StreakSummary;
}

export async function getStudentDashboardData(): Promise<StudentDashboardData | null> {
  try {
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

    return {
      firstName: user.name?.trim().split(/\s+/)[0] || "Xasan",
      whatsNew,
      streakCount,
      success,
      subscription,
      weeklyActivity,
      readingStats,
      speakingStats,
      premium,
      studyStreak,
    };
  } catch (error) {
    console.error("Failed to load student dashboard data:", error);
    return null;
  }
}
