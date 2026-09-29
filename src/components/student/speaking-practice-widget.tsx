import Link from "next/link";
import { Calendar, Gauge, Mic } from "lucide-react";

import type { SpeakingPracticeStats } from "@/lib/speaking-practice";
import { formatRelativeTime } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";

/** Phase 37 — Speaking Practice dashboard widget. Every number is a real query (see getSpeakingPracticeStats). */
export function SpeakingPracticeWidget({ stats }: { stats: SpeakingPracticeStats }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-medium">Speaking Practice</h2>
        <Link href="/student/speaking-practice/history" className="text-accent text-sm font-medium hover:underline">
          View history
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Speaking Practices" value={String(stats.practiceCount)} icon={Mic} />
        <StatCard label="Average Estimated Band" value={stats.averageBand?.toFixed(1) ?? "—"} icon={Gauge} />
        <StatCard
          label="Last Practice Date"
          value={stats.lastPracticeDate ? formatRelativeTime(stats.lastPracticeDate) : "—"}
          icon={Calendar}
        />
      </div>
    </div>
  );
}
