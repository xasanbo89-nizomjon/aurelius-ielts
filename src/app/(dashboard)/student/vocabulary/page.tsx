import type { Metadata } from "next";
import Link from "next/link";
import { Clock, History, Layers } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getStudentVocabulary, getStudentVocabularyStats } from "@/lib/vocabulary";
import { toWordIntelligence } from "@/lib/ai/vocabulary-assistant";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { VocabularyNotebook } from "@/components/student/vocabulary-notebook";
import { VocabularyStatsCards } from "@/components/analytics/vocabulary-stats-cards";
import { ExportVocabularyButton } from "@/components/student/export-vocabulary-button";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";
import type { WordDetailsEntry } from "@/components/student/word-details-modal";

export const metadata: Metadata = { title: "Vocabulary" };

// A student's own notebook is inherently bounded (a few hundred words at
// most in practice) — fetched in full here so search/filter/sort can be
// real-time and client-side, with this as a defensive upper cap, not true
// pagination.
const NOTEBOOK_FETCH_CAP = 1000;

export default async function VocabularyPage() {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="the Vocabulary Learning Center" />;
  }

  const [{ entries }, stats] = await Promise.all([
    getStudentVocabulary(profile.id, { pageSize: NOTEBOOK_FETCH_CAP }),
    getStudentVocabularyStats(profile.id),
  ]);

  const notebookEntries: WordDetailsEntry[] = entries.map((entry) => ({
    id: entry.id,
    status: entry.status,
    addedAt: entry.addedAt,
    word: entry.vocabularyWord.word,
    hasAiInsights: entry.vocabularyWord.aiGeneratedAt != null,
    ...toWordIntelligence(entry.vocabularyWord),
  }));

  return (
    <>
      <PageHeader
        title="Vocabulary"
        description="Every word you've saved while reading, in one place for review."
        actions={
          <div className="flex items-center gap-2">
            <ExportVocabularyButton />
            <Button asChild variant="outline" size="sm">
              <Link href="/student/vocabulary/history">
                <History className="size-4" /> AI History
              </Link>
            </Button>
          </div>
        }
      />

      <VocabularyStatsCards stats={stats} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Most Recent Word"
          value={stats.mostRecentWord ? stats.mostRecentWord.word.toUpperCase() : "—"}
          icon={Clock}
          caption={stats.mostRecentWord ? `Saved ${stats.mostRecentWord.addedAt.toLocaleDateString()}` : "No words saved yet"}
          valueClassName={stats.mostRecentWord ? undefined : "text-xl"}
        />
        <StatCard
          label="Current Vocabulary Size"
          value={`${stats.total} word${stats.total === 1 ? "" : "s"}`}
          icon={Layers}
          caption="Across every status"
          valueClassName="text-3xl"
        />
      </div>

      <VocabularyNotebook entries={notebookEntries} />
    </>
  );
}
