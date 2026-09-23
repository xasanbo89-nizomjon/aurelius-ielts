import { BookMarked, Search, CheckCircle2, AlertTriangle, XCircle, Gauge } from "lucide-react";

import { VOCABULARY_STATUS_LABELS, VOCABULARY_STATUS_EMOJI } from "@/lib/labels";
import { StatCard } from "@/components/dashboard/stat-card";

export type VocabularyStatsSummary = {
  total: number;
  unknown: number;
  learning: number;
  known: number;
  vocabularyScore: number | null;
  /** Total lookup EVENTS (VocabularyLookup rows) — distinct from `total`, which counts unique words. Omitted where the caller only has per-word stats, not the search log. */
  totalSearches?: number;
};

/**
 * The shared Unique Words / Hard / Medium / Easy / Score breakdown (Phase
 * 19) — used on the Band Conversation Student Performance Profile (teacher
 * view), the student's own Profile page, and the vocabulary notebook, so
 * all three always show the exact same real numbers computed the exact
 * same way (VocabularyStats.vocabularyScore in src/lib/vocabulary.ts).
 */
export function VocabularyStatsCards({ stats }: { stats: VocabularyStatsSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {stats.totalSearches != null && (
        <StatCard label="Total Searches" value={String(stats.totalSearches)} icon={Search} caption="Every word click, including repeats" />
      )}
      <StatCard label="Unique Words" value={String(stats.total)} icon={BookMarked} />
      <StatCard
        label={`${VOCABULARY_STATUS_EMOJI.UNKNOWN} ${VOCABULARY_STATUS_LABELS.UNKNOWN}`}
        value={String(stats.unknown)}
        icon={XCircle}
      />
      <StatCard
        label={`${VOCABULARY_STATUS_EMOJI.LEARNING} ${VOCABULARY_STATUS_LABELS.LEARNING}`}
        value={String(stats.learning)}
        icon={AlertTriangle}
      />
      <StatCard
        label={`${VOCABULARY_STATUS_EMOJI.KNOWN} ${VOCABULARY_STATUS_LABELS.KNOWN}`}
        value={String(stats.known)}
        icon={CheckCircle2}
      />
      <StatCard
        label="Vocabulary Score"
        value={stats.vocabularyScore != null ? `${stats.vocabularyScore}%` : "—"}
        icon={Gauge}
        caption={stats.total === 0 ? "No words viewed yet" : "Easy + half of Medium"}
      />
    </div>
  );
}
