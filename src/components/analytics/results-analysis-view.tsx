import Link from "next/link";
import { BarChart3, ClipboardCheck, Gauge, Percent, Users } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { percentText, type QuestionStat } from "@/lib/analytics/results-math";
import type { BandDistribution, ResultsOverview, StudentAnalysisRow } from "@/lib/analytics/results-analysis";
import type { TypeAccuracy } from "@/lib/analytics/results-math";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { AccuracyByType } from "@/components/analytics/accuracy-by-type";

const questionLabel = (stat: Pick<QuestionStat, "startNumber" | "endNumber">) => (stat.startNumber === stat.endNumber ? `Q${stat.startNumber}` : `Q${stat.startNumber}–${stat.endNumber}`);
const trendText = (change: number | null) => (change == null ? "—" : change > 0 ? `+${change.toFixed(1)}` : change.toFixed(1));

/**
 * Phase M - the teacher's results analysis: how many attempts and students are behind it, the spread of bands, accuracy by question type, the questions students
 * miss most, and - one row per student - the weakest question types, where the band is going and the latest attempts. The same view serves a whole group
 * (every student of a teacher, or every student for a Root Teacher), one test, or one student; WHICH students is decided by the caller's query scope, never here.
 * Nothing is estimated: a student with one scored attempt has no trend, a type with a handful of questions says so.
 */
export function ResultsAnalysisView({
  overview,
  bands,
  accuracy,
  questions,
  allQuestions,
  students,
  emptyHint,
  showSummary = true,
}: {
  overview: ResultsOverview;
  bands: BandDistribution;
  accuracy: TypeAccuracy[];
  /** The most-missed questions, worst first. */
  questions: QuestionStat[];
  /** Every question of the selected test with its accuracy, in test order (only when ONE test is selected). */
  allQuestions?: QuestionStat[];
  students?: StudentAnalysisRow[];
  emptyHint?: string;
  /** The four figures on top; a page that already shows its own (the per-test page) leaves them out. */
  showSummary?: boolean;
}) {
  if (overview.attempts === 0) {
    return <EmptyState icon={BarChart3} title="No finished tests to analyse yet" description={emptyHint ?? "When students finish Reading or Listening tests, their results are analysed here. Try a wider date range or fewer filters."} />;
  }

  return (
    <div className="space-y-10" data-testid="results-analysis">
      {showSummary && (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Finished attempts" value={String(overview.attempts)} icon={ClipboardCheck} />
        <StatCard label="Students" value={String(overview.students)} icon={Users} />
        <StatCard label="Average band" value={overview.averageBand != null ? overview.averageBand.toFixed(1) : "—"} icon={Gauge} caption={overview.averageBand == null ? "No stored band yet" : undefined} />
        <StatCard label="Average score" value={overview.averageScorePercent != null ? `${overview.averageScorePercent}%` : "—"} icon={Percent} />
      </div>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium tracking-tight">Band distribution</h2>
        {bands.buckets.length === 0 ? (
          <p className="text-muted-foreground text-sm">None of these attempts has a stored band.</p>
        ) : (
          <div className="border-border/70 bg-card rounded-2xl border px-5 py-4" data-testid="band-distribution">
            <BarChart data={bands.buckets.map((bucket) => ({ label: bucket.band.toFixed(1), value: bucket.count, tooltip: `Band ${bucket.band.toFixed(1)}: ${bucket.count} attempt${bucket.count === 1 ? "" : "s"}` }))} ariaLabel="Number of attempts at each band" maxBarWidth={56} />
            <p className="text-muted-foreground mt-2 text-xs">
              {bands.scored} attempt{bands.scored === 1 ? "" : "s"} with a band{bands.unscored > 0 ? `; ${bands.unscored} without a stored band are not in the chart` : ""}.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-medium tracking-tight">Accuracy by question type</h2>
          <p className="text-muted-foreground text-sm">Question numbers answered right out of those asked, over every attempt here. A question left empty counts as wrong.</p>
        </div>
        <AccuracyByType rows={accuracy} />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-medium tracking-tight">Most-missed questions</h2>
          <p className="text-muted-foreground text-sm">Lowest accuracy first. A matching, summary or Choose-TWO question counts as one line covering its numbers.</p>
        </div>
        {questions.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-2xl border border-dashed px-5 py-8 text-center text-sm" data-testid="missed-empty">
            Every question was answered right every time - nothing was missed yet.
          </p>
        ) : (
          <div className="border-border/70 bg-card divide-border/70 divide-y rounded-2xl border" data-testid="most-missed">
            {questions.map((stat) => (
              <div key={stat.questionId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3" data-testid={`missed-${stat.startNumber}`}>
                <span className="bg-secondary inline-flex min-w-12 items-center justify-center rounded-md px-2 py-1 text-xs font-semibold">{questionLabel(stat)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm">{stat.prompt.trim() || stat.label}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {stat.label} · {stat.testTitle}
                  </p>
                </div>
                <p className="text-right text-sm tabular-nums">
                  <span className="font-medium">{percentText(stat.accuracy)}</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {stat.correct % 1 === 0 ? stat.correct : stat.correct.toFixed(1)} of {stat.total}
                  </span>
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {allQuestions && allQuestions.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-medium tracking-tight">Accuracy per question</h2>
          <div className="border-border/70 bg-card divide-border/70 divide-y rounded-2xl border" data-testid="per-question">
            {allQuestions.map((stat) => (
              <div key={stat.questionId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-2.5" data-testid={`question-${stat.startNumber}`}>
                <span className="bg-secondary inline-flex min-w-12 items-center justify-center rounded-md px-2 py-1 text-xs font-semibold">{questionLabel(stat)}</span>
                <div className="min-w-0 space-y-1">
                  <p className="text-muted-foreground truncate text-xs">{stat.label}</p>
                  <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
                    <div className="bg-accent h-full rounded-full" style={{ width: `${Math.max(2, Math.round(stat.accuracy * 100))}%` }} />
                  </div>
                </div>
                <p className="text-right text-sm tabular-nums">
                  <span className="font-medium">{percentText(stat.accuracy)}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{stat.attempts} attempt{stat.attempts === 1 ? "" : "s"}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {students && students.length > 0 && (
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-medium tracking-tight">Students</h2>
            <p className="text-muted-foreground text-sm">Lowest average band first. A band trend needs two scored attempts; a weak question type needs at least five questions behind it.</p>
          </div>
          <div className="border-border/70 bg-card overflow-x-auto rounded-2xl border">
            <table className="w-full text-left text-sm" data-testid="students-table">
              <thead>
                <tr className="text-muted-foreground border-border/70 border-b text-xs">
                  <th className="px-4 py-2.5 font-medium">Student</th>
                  <th className="px-4 py-2.5 font-medium">Attempts</th>
                  <th className="px-4 py-2.5 font-medium">Average band</th>
                  <th className="px-4 py-2.5 font-medium">Band trend</th>
                  <th className="px-4 py-2.5 font-medium">Weakest question types</th>
                  <th className="px-4 py-2.5 font-medium">Recent attempts</th>
                </tr>
              </thead>
              <tbody className="divide-border/70 divide-y">
                {students.map((student) => (
                  <tr key={student.studentId} data-testid={`student-row-${student.studentId}`} className="align-top">
                    <td className="px-4 py-3">
                      <Link href={`/teacher/students/${student.studentId}`} className="font-medium hover:underline">
                        {student.name ?? student.email}
                      </Link>
                      {student.name && <p className="text-muted-foreground text-xs">{student.email}</p>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{student.attempts}</td>
                    <td className="px-4 py-3 tabular-nums" data-testid="student-average">
                      {student.averageBand != null ? student.averageBand.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums" data-testid="student-trend">
                      {student.trend.change != null ? (
                        <span title={`First scored attempt ${student.trend.first?.toFixed(1)}, latest ${student.trend.last?.toFixed(1)}`}>
                          {trendText(student.trend.change)} <span className="text-muted-foreground text-xs">({student.trend.first?.toFixed(1)} → {student.trend.last?.toFixed(1)})</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Needs 2 scored attempts</span>
                      )}
                    </td>
                    <td className="px-4 py-3" data-testid="student-weakest">
                      {student.weakest.length === 0 ? (
                        <span className="text-muted-foreground text-xs">Not enough data</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {student.weakest.map((entry) => (
                            <li key={entry.type} className="text-xs">
                              <span className="font-medium">{entry.label}</span> <span className="tabular-nums">{percentText(entry.accuracy)}</span> <span className="text-muted-foreground">({entry.total} q)</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ul className="space-y-0.5">
                        {student.recent.map((attempt) => (
                          <li key={attempt.resultId} className="text-xs">
                            <Link href={`/teacher/band-conversation/${student.studentId}/attempts/${attempt.resultId}`} className="hover:underline" data-testid="recent-attempt">
                              {attempt.testTitle}
                            </Link>{" "}
                            <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]">
                              {attempt.band != null ? `Band ${attempt.band.toFixed(1)}` : "no band"}
                            </Badge>
                            <span className="text-muted-foreground ml-1">{formatDateTime(attempt.at)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
