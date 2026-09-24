import type { Metadata } from "next";

import { requireStudentProfile } from "@/lib/session";
import {
  getProfileInsights,
  getProgressHistory,
  getResultCards,
  getSkillPerformance,
  getStrengths,
  getWeaknesses,
  getWeeklyActivity,
  summarizeResultCards,
} from "@/lib/analytics/student-insights";
import { getWritingAnalytics } from "@/lib/ai/writing";
import { getSpeakingAnalytics } from "@/lib/speaking";
import { getReadingListeningMistakes, getWritingMistakes, getSpeakingReviews } from "@/lib/analytics/mistake-center";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProfileInsights } from "@/components/analytics/profile-insights";
import { PerformanceOverview } from "@/components/analytics/performance-overview";
import { SkillBreakdownCards } from "@/components/analytics/skill-breakdown-cards";
import { InsightList } from "@/components/analytics/insight-list";
import { ProgressCharts } from "@/components/analytics/progress-charts";
import { WeeklyActivityChart } from "@/components/analytics/weekly-activity-chart";
import { ProgressHistoryTable } from "@/components/analytics/progress-history-table";
import { BandScoreHeader } from "@/components/analytics/band-score-header";
import { BandScoreCenterTabs } from "@/components/analytics/band-score-center-tabs";

export const metadata: Metadata = { title: "Band Score Center" };

export default async function StudentAnalyticsPage() {
  const { profile } = await requireStudentProfile();

  const [
    resultCards,
    skills,
    weaknesses,
    strengths,
    history,
    weeklyActivity,
    writingAnalytics,
    speakingAnalytics,
    readingListeningMistakes,
    writingMistakes,
    speakingReviews,
  ] = await Promise.all([
    getResultCards(profile.id),
    getSkillPerformance(profile.id),
    getWeaknesses(profile.id),
    getStrengths(profile.id),
    getProgressHistory(profile.id),
    getWeeklyActivity(profile.id),
    getWritingAnalytics(profile.id),
    getSpeakingAnalytics(profile.id),
    getReadingListeningMistakes(profile.id),
    getWritingMistakes(profile.id),
    getSpeakingReviews(profile.id),
  ]);

  const readingMistakes = readingListeningMistakes.filter((r) => r.skill === "READING");
  const listeningMistakes = readingListeningMistakes.filter((r) => r.skill === "LISTENING");
  const overview = summarizeResultCards(resultCards);
  const profileInsights = getProfileInsights(overview, skills);
  const reading = skills.find((s) => s.skill === "READING")?.avgBand ?? null;
  const listening = skills.find((s) => s.skill === "LISTENING")?.avgBand ?? null;

  return (
    <>
      <PageHeader
        title="Band Score Center"
        description="Your real performance, built entirely from your own completed tests and reviews."
      />

      <BandScoreHeader
        overview={{
          overallBand: overview.avgBand,
          readingBand: reading,
          listeningBand: listening,
          writingBand: writingAnalytics.averageBand,
          speakingBand: speakingAnalytics.averageBand,
        }}
      />

      <BandScoreCenterTabs
        resultCards={resultCards}
        readingMistakes={readingMistakes}
        listeningMistakes={listeningMistakes}
        writingMistakes={writingMistakes}
        speakingReviews={speakingReviews}
        overviewContent={
          <>
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
        }
      />
    </>
  );
}
