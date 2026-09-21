import type { Metadata } from "next";

import { requireStudentProfile } from "@/lib/session";
import {
  getPerformanceOverview,
  getProfileInsights,
  getProgressHistory,
  getSkillPerformance,
  getStrengths,
  getWeaknesses,
  getWeeklyActivity,
} from "@/lib/analytics/student-insights";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProfileInsights } from "@/components/analytics/profile-insights";
import { PerformanceOverview } from "@/components/analytics/performance-overview";
import { SkillBreakdownCards } from "@/components/analytics/skill-breakdown-cards";
import { InsightList } from "@/components/analytics/insight-list";
import { ProgressCharts } from "@/components/analytics/progress-charts";
import { WeeklyActivityChart } from "@/components/analytics/weekly-activity-chart";
import { ProgressHistoryTable } from "@/components/analytics/progress-history-table";

export const metadata: Metadata = { title: "Analytics" };

export default async function StudentAnalyticsPage() {
  const { profile } = await requireStudentProfile();

  const [overview, skills, weaknesses, strengths, history, weeklyActivity] = await Promise.all([
    getPerformanceOverview(profile.id),
    getSkillPerformance(profile.id),
    getWeaknesses(profile.id),
    getStrengths(profile.id),
    getProgressHistory(profile.id),
    getWeeklyActivity(profile.id),
  ]);
  const profileInsights = getProfileInsights(overview, skills);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="A deeper look at your performance, built entirely from your own completed tests."
      />

      <ProfileInsights insights={profileInsights} />

      <PerformanceOverview overview={overview} />

      <SkillBreakdownCards skills={skills} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <InsightList
          title="Weakness Tracker"
          description="Your lowest-accuracy question types and sections."
          insights={weaknesses}
          tone="weak"
        />
        <InsightList
          title="Strength Tracker"
          description="Your highest-accuracy question types and sections."
          insights={strengths}
          tone="strong"
        />
      </div>

      <ProgressCharts history={history} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <WeeklyActivityChart weeks={weeklyActivity} />
        <ProgressHistoryTable history={history} />
      </div>
    </>
  );
}
