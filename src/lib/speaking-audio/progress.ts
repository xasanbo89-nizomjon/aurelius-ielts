import { averageBand, CRITERIA } from "@/lib/speaking-audio/bands";

/**
 * Phase Q-B - the progress screen of the recorded Speaking practices, pure: the band trend and the average per criterion. Only assessed practices (DONE, with
 * their bands) are ever counted - a pending or failed one has nothing to show - and every number is an average or a count of those stored bands.
 */

export type ProgressPractice = {
  id: string;
  at: Date;
  part: number;
  overall: number | null;
  fluency: number | null;
  lexical: number | null;
  grammar: number | null;
  pronunciation: number | null;
};

export type TrendPoint = { id: string; at: Date; part: number; overall: number };

/** The overall bands in the order they were made (oldest first), at most the last `limit`. */
export function trendPoints(practices: readonly ProgressPractice[], limit = 30): TrendPoint[] {
  return practices
    .filter((practice): practice is ProgressPractice & { overall: number } => practice.overall != null)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(-limit)
    .map((practice) => ({ id: practice.id, at: practice.at, part: practice.part, overall: practice.overall }));
}

export type CriterionAverage = { key: "fluency" | "lexical" | "grammar" | "pronunciation"; label: string; average: number | null; count: number };

export function criterionAverages(practices: readonly ProgressPractice[]): CriterionAverage[] {
  return CRITERIA.map(({ key, label }) => {
    const values = practices.map((practice) => practice[key]);
    return { key, label, average: averageBand(values), count: values.filter((value) => value != null).length };
  });
}

export type ProgressSummary = {
  count: number;
  latest: number | null;
  best: number | null;
  average: number | null;
  /** Latest minus the one before it (null with fewer than two). */
  change: number | null;
  /** The weakest criterion by average, when there are at least two assessed practices. */
  weakest: CriterionAverage | null;
};

export function summarise(practices: readonly ProgressPractice[]): ProgressSummary {
  const points = trendPoints(practices, Number.MAX_SAFE_INTEGER);
  const bands = points.map((point) => point.overall);
  const latest = bands.length > 0 ? bands[bands.length - 1] : null;
  const previous = bands.length > 1 ? bands[bands.length - 2] : null;
  const averages = criterionAverages(practices).filter((entry) => entry.average != null);
  const weakest = bands.length >= 2 && averages.length > 0 ? averages.reduce((min, entry) => ((entry.average as number) < (min.average as number) ? entry : min)) : null;
  return {
    count: bands.length,
    latest,
    best: bands.length > 0 ? Math.max(...bands) : null,
    average: averageBand(bands),
    change: latest != null && previous != null ? Math.round((latest - previous) * 10) / 10 : null,
    weakest,
  };
}

/** "+0.5", "-1.0", "no change" - the change since the previous practice. */
export function changeText(change: number | null): string | null {
  if (change == null) return null;
  if (change === 0) return "no change";
  return `${change > 0 ? "+" : "-"}${Math.abs(change).toFixed(1)}`;
}
