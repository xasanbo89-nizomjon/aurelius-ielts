import { BookOpen, Clock, Flame, Highlighter, Layers } from "lucide-react";

import type { StudentReadingStats } from "@/lib/reading-analytics";
import { StatCard } from "@/components/dashboard/stat-card";

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Phase 36 — Part 7. Every number is a real query (see getStudentReadingStats) — no fabricated baselines. */
export function ReadingStatsWidget({ stats }: { stats: StudentReadingStats }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-medium">Reading Habits</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Articles Read" value={String(stats.articlesRead)} icon={BookOpen} />
        <StatCard label="Reading Time" value={formatDuration(stats.totalReadingTimeSeconds)} icon={Clock} />
        <StatCard label="Words Saved" value={String(stats.wordsSaved)} icon={Layers} />
        <StatCard label="Highlights" value={String(stats.highlightsCreated)} icon={Highlighter} />
        <StatCard label="Reading Streak" value={`${stats.readingStreak}d`} icon={Flame} />
      </div>
    </div>
  );
}
