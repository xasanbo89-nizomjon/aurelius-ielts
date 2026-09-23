import { TrendingUp, TrendingDown } from "lucide-react";

import type { WeaknessAnalysis } from "@/lib/analytics/band-conversation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function TopicList({ topics, variant }: { topics: WeaknessAnalysis["strongAreas"]; variant: "success" | "destructive" }) {
  if (topics.length === 0) {
    return <p className="text-muted-foreground text-sm">Not enough data yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {topics.map((topic) => (
        <li key={topic.type} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate">{topic.label}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground text-xs">{topic.sampleSize} answered</span>
            <Badge variant={variant}>{topic.accuracy}%</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function WeaknessAnalysisCard({ analysis }: { analysis: WeaknessAnalysis }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Weakness Analysis</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="text-success size-4.5" aria-hidden="true" /> Strong Areas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopicList topics={analysis.strongAreas} variant="success" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="text-destructive size-4.5" aria-hidden="true" /> Weak Areas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopicList topics={analysis.weakAreas} variant="destructive" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
