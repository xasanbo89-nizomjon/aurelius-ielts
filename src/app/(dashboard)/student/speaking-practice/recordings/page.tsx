import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Gauge, Mic, Target, TrendingUp, Trophy } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getAllowance, listForStudent } from "@/lib/speaking-audio/practice";
import { changeText, criterionAverages, summarise, trendPoints, type ProgressPractice } from "@/lib/speaking-audio/progress";
import { STATUS_LABEL } from "@/lib/speaking-audio/status";
import { bandText, dateTimeText, snippet, untilText } from "@/lib/speaking-audio/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BandTrendCard, CriterionAveragesCard } from "@/components/student/speaking-audio/band-trend";

export const metadata: Metadata = { title: "My speaking recordings" };

export default async function MySpeakingRecordingsPage() {
  const { profile } = await requireStudentProfile();
  const [rows, allowance] = await Promise.all([listForStudent(profile.id), getAllowance(profile.id)]);

  const assessed: ProgressPractice[] = rows
    .filter((row) => row.status === "DONE" && row.overallBand != null)
    .map((row) => ({
      id: row.id,
      at: row.submittedAt ?? row.createdAt,
      part: row.part,
      overall: row.overallBand,
      fluency: row.fluencyBand,
      lexical: row.lexicalBand,
      grammar: row.grammarBand,
      pronunciation: row.pronunciationBand,
    }));
  const summary = summarise(assessed);
  const trend = trendPoints(assessed);
  const averages = criterionAverages(assessed);
  const change = changeText(summary.change);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="My speaking recordings"
        description="Every answer you recorded, with its AI feedback and your progress. AI estimates - not official IELTS scores."
        actions={
          <Button asChild size="sm">
            <Link href="/student/speaking-practice/record">
              <Mic className="size-4" /> Record a new answer
            </Link>
          </Button>
        }
      />

      <p className="text-muted-foreground text-xs" data-testid="allowance-line">
        {allowance.remaining} of {allowance.limit} recorded practices left today
        {allowance.remaining === 0 ? ` - they come back ${untilText(allowance.resetsAt)}` : ""}.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={Mic}
          title="No recordings yet"
          description="Answer a question out loud and the AI will assess your fluency, vocabulary, grammar and pronunciation."
          action={
            <Button asChild>
              <Link href="/student/speaking-practice/record">Record your first answer</Link>
            </Button>
          }
        />
      ) : (
        <>
          {summary.count > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="progress-stats">
              <StatCard label="Latest band" value={bandText(summary.latest)} icon={Gauge} caption={change ? `${change} since the one before` : "your first assessed practice"} />
              <StatCard label="Best band" value={bandText(summary.best)} icon={Trophy} />
              <StatCard label="Average band" value={bandText(summary.average)} icon={Target} caption={`${summary.count} assessed`} />
              <StatCard label="Weakest criterion" value={summary.weakest ? summary.weakest.label.split(" ")[0] : "-"} icon={TrendingUp} caption={summary.weakest ? `average ${bandText(summary.weakest.average)}` : "needs two assessed practices"} />
            </div>
          )}

          {trend.length > 0 && <BandTrendCard points={trend} />}
          <CriterionAveragesCard averages={averages} />

          <Card>
            <CardContent className="space-y-3 py-5">
              <h2 className="font-display text-lg font-medium">All recordings</h2>
              <ul className="divide-border divide-y" data-testid="recording-list">
                {rows.map((row) => (
                  <li key={row.id} data-testid="recording-row" data-status={row.status}>
                    <Link href={`/student/speaking-practice/record/${row.id}`} className="hover:bg-secondary/50 -mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors">
                      <span className="min-w-0 space-y-0.5">
                        <span className="block truncate text-sm font-medium">{snippet(row.question)}</span>
                        <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline">Part {row.part}</Badge>
                          {dateTimeText(row.submittedAt ?? row.createdAt)}
                          {row._count.comments > 0 && <span>{row._count.comments} teacher comment{row._count.comments === 1 ? "" : "s"}</span>}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {row.status === "DONE" ? (
                          <span className="font-display text-xl font-medium tabular-nums" data-testid="row-band">
                            {bandText(row.overallBand)}
                          </span>
                        ) : (
                          <Badge variant={row.status === "FAILED" ? "destructive" : "secondary"}>{STATUS_LABEL[row.status]}</Badge>
                        )}
                        <ArrowUpRight className="text-muted-foreground size-4" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
