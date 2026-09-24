"use client";

import type { ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TestHistoryTab } from "@/components/analytics/test-history-tab";
import { MistakeCenterView } from "@/components/analytics/mistake-center-view";
import { AIAnalysisPanel } from "@/components/analytics/ai-analysis-panel";
import { ImprovementPlanPanel } from "@/components/analytics/improvement-plan-panel";
import type { ResultSummaryCard } from "@/lib/analytics/student-insights";
import type { ReadingListeningMistake, WritingMistake, SpeakingReviewEntry } from "@/lib/analytics/mistake-center";

export function BandScoreCenterTabs({
  overviewContent,
  resultCards,
  readingMistakes,
  listeningMistakes,
  writingMistakes,
  speakingReviews,
}: {
  overviewContent: ReactNode;
  resultCards: ResultSummaryCard[];
  readingMistakes: ReadingListeningMistake[];
  listeningMistakes: ReadingListeningMistake[];
  writingMistakes: WritingMistake[];
  speakingReviews: SpeakingReviewEntry[];
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="history">Test History</TabsTrigger>
        <TabsTrigger value="mistakes">Mistakes</TabsTrigger>
        <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
        <TabsTrigger value="plan">Improvement Plan</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-8">
        {overviewContent}
      </TabsContent>

      <TabsContent value="history">
        <TestHistoryTab results={resultCards} />
      </TabsContent>

      <TabsContent value="mistakes">
        <MistakeCenterView
          readingMistakes={readingMistakes}
          listeningMistakes={listeningMistakes}
          writingMistakes={writingMistakes}
          speakingReviews={speakingReviews}
        />
      </TabsContent>

      <TabsContent value="analysis">
        <AIAnalysisPanel />
      </TabsContent>

      <TabsContent value="plan">
        <ImprovementPlanPanel />
      </TabsContent>
    </Tabs>
  );
}
