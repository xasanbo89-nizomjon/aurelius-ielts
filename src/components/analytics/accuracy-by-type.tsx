import { percentText, type TypeAccuracy } from "@/lib/analytics/results-math";

/**
 * Phase M - accuracy by question type, with the number of questions behind every figure ("TFNG 45% - 18 of 40 questions"). A figure over only a few questions
 * says so instead of looking as solid as one over a hundred. Used for a student's own statistics and for a teacher's group / test / student views.
 */
export function AccuracyByType({ rows, emptyText = "No finished tests yet." }: { rows: TypeAccuracy[]; emptyText?: string }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground border-border rounded-2xl border border-dashed px-5 py-8 text-center text-sm" data-testid="accuracy-empty">
        {emptyText}
      </p>
    );
  }
  return (
    <div className="border-border/70 bg-card divide-border/70 divide-y rounded-2xl border" data-testid="accuracy-by-type">
      {rows.map((row) => (
        <div key={row.type} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]" data-testid={`accuracy-${row.type}`}>
          <p className="truncate text-sm font-medium">{row.label}</p>
          <div className="bg-secondary order-3 col-span-2 h-2 overflow-hidden rounded-full sm:order-none sm:col-span-1" role="img" aria-label={`${row.label}: ${percentText(row.accuracy)} right`}>
            <div className="bg-accent h-full rounded-full" style={{ width: `${Math.max(2, Math.round(row.accuracy * 100))}%` }} />
          </div>
          <p className="text-right text-sm tabular-nums">
            <span className="font-medium" data-testid="accuracy-percent">
              {percentText(row.accuracy)}
            </span>
            <span className="text-muted-foreground ml-2 text-xs" data-testid="accuracy-count">
              {row.correct % 1 === 0 ? row.correct : row.correct.toFixed(1)} of {row.total} question{row.total === 1 ? "" : "s"}
              {row.total < 5 ? " (few so far)" : ""}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}
