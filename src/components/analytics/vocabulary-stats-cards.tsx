import { BookMarked, CheckCircle2, AlertTriangle, XCircle, Gauge } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";

export type VocabularyStatsSummary = {
  total: number;
  unknown: number;
  learning: number;
  known: number;
  vocabularyScore: number | null;
};

/**
 * The shared Total/Red/Yellow/Green/Score breakdown (Phase 19) — used on
 * both the Band Conversation Student Performance Profile (teacher view) and
 * the student's own Profile page, so the two always show the exact same
 * real numbers computed the exact same way (VocabularyStats.vocabularyScore
 * in src/lib/vocabulary.ts).
 */
export function VocabularyStatsCards({ stats }: { stats: VocabularyStatsSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard label="Total Words Viewed" value={String(stats.total)} icon={BookMarked} />
      <StatCard label="Green" value={String(stats.known)} icon={CheckCircle2} caption="Viewed" />
      <StatCard label="Yellow" value={String(stats.learning)} icon={AlertTriangle} caption="Partially known" />
      <StatCard label="Red" value={String(stats.unknown)} icon={XCircle} caption="Needs revision" />
      <StatCard
        label="Vocabulary Score"
        value={stats.vocabularyScore != null ? `${stats.vocabularyScore}%` : "—"}
        icon={Gauge}
        caption={stats.total === 0 ? "No words viewed yet" : "Green + half of Yellow"}
      />
    </div>
  );
}
