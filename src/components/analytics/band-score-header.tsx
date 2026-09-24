import { Gauge } from "lucide-react";

import type { BandScoreOverview } from "@/actions/ai-insights.actions";
import { StatCard } from "@/components/dashboard/stat-card";

function formatBand(band: number | null): string {
  return band != null ? band.toFixed(1) : "—";
}

export function BandScoreHeader({ overview }: { overview: BandScoreOverview }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Overall Band" value={formatBand(overview.overallBand)} icon={Gauge} />
      <StatCard label="Reading" value={formatBand(overview.readingBand)} icon={Gauge} />
      <StatCard label="Listening" value={formatBand(overview.listeningBand)} icon={Gauge} />
      <StatCard label="Writing" value={formatBand(overview.writingBand)} icon={Gauge} />
      <StatCard label="Speaking" value={formatBand(overview.speakingBand)} icon={Gauge} />
    </div>
  );
}
