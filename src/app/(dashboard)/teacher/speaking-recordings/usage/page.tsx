import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Coins, Cpu, Gauge, Mic, Sigma } from "lucide-react";

import { requireTeacherProfile } from "@/lib/session";
import { getDailyLimit } from "@/lib/speaking-audio/practice";
import { getUsageReport, monthValue, parseMonth, shiftMonth } from "@/lib/speaking-audio/usage";
import { formatUsd } from "@/lib/speaking-audio/cost";
import { speakingModels } from "@/lib/ai/services/speaking-audio-assessment";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DailyLimitForm } from "@/components/teacher/speaking-audio/daily-limit-form";

export const metadata: Metadata = { title: "Speaking AI usage" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const KIND_LABEL: Record<string, string> = { TRANSCRIBE: "Transcription", ASSESS: "Assessment (listens to audio)", ASSESS_RETRY: "Assessment, second try", ASSESS_TEXT: "Assessment from transcript" };
const number = (value: number) => value.toLocaleString("en-US");

export default async function SpeakingUsagePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { profile } = await requireTeacherProfile();
  // The usage and cost of the AI, and the daily limit, belong to the Root Teacher.
  if (!profile.isRootTeacher) redirect("/teacher/speaking-recordings");

  const { month: monthParam } = await searchParams;
  const month = parseMonth(monthParam);
  const [report, limit] = await Promise.all([getUsageReport(month), getDailyLimit()]);
  const models = speakingModels();
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="space-y-6" data-testid="usage-page">
      <PageHeader
        title="Speaking AI usage and cost"
        description="What the recorded Speaking practices have used of the AI service, from the usage log. Costs are estimates."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/teacher/speaking-recordings">
              <ArrowLeft className="size-4" /> Recordings
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" data-testid="month-nav">
          <Button asChild variant="outline" size="icon" aria-label="Previous month">
            <Link href={`/teacher/speaking-recordings/usage?month=${monthValue(previous)}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <p className="font-display min-w-40 text-center text-lg font-medium" data-testid="month-label">
            {MONTH_NAMES[month.month - 1]} {month.year}
          </p>
          <Button asChild variant="outline" size="icon" aria-label="Next month">
            <Link href={`/teacher/speaking-recordings/usage?month=${monthValue(next)}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">Months and days are counted in Tashkent time (UTC+5).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="usage-stats">
        <StatCard label="Cost this month (estimate)" value={formatUsd(report.totals.costUsd)} icon={Coins} caption={`${number(report.totals.calls)} AI calls, ${report.totals.failedCalls} failed`} />
        <StatCard
          label="Cost of one assessment"
          value={report.averageCostPerAssessmentUsd == null ? "-" : formatUsd(report.averageCostPerAssessmentUsd)}
          icon={Sigma}
          caption={report.assessedSample > 0 ? `measured on the last ${report.assessedSample} assessed practices` : "no assessed practice yet"}
        />
        <StatCard label="Practices submitted" value={number(report.practices.submitted)} icon={Mic} caption={`${report.practices.assessed} assessed, ${report.practices.failed} failed, ${report.practices.waiting} waiting`} />
        <StatCard label="Audio transcribed" value={`${report.totals.transcribedMinutes.toFixed(1)} min`} icon={Clock} caption={`${number(report.totals.audioInputTokens)} audio tokens to the assessment`} />
      </div>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="font-display flex items-center gap-2 text-lg font-medium">
            <Gauge className="text-accent size-5" /> Daily limit
          </h2>
          <p className="text-muted-foreground text-sm">
            Each student may record <strong className="text-foreground">{limit}</strong> practice{limit === 1 ? "" : "s"} a day (the day turns over at midnight Tashkent time). A failed assessment that is tried again is the same practice and does not count twice.
          </p>
          <DailyLimitForm current={limit} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="font-display flex items-center gap-2 text-lg font-medium">
            <Cpu className="text-accent size-5" /> By model
          </h2>
          <p className="text-muted-foreground text-xs" data-testid="models-in-use">
            In use now: transcription <Badge variant="outline">{models.transcribe}</Badge> assessment <Badge variant="outline">{models.assess}</Badge> fallback (no audio) <Badge variant="outline">{models.fallback}</Badge>
          </p>
          {report.byModel.length === 0 ? (
            <p className="text-muted-foreground text-sm">No AI calls this month.</p>
          ) : (
            <Table data-testid="by-model">
              <TableHeader>
                <TableRow>
                  <TableHead>Call</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Prompt tokens</TableHead>
                  <TableHead className="text-right">Audio tokens</TableHead>
                  <TableHead className="text-right">Output tokens</TableHead>
                  <TableHead className="text-right">Audio min</TableHead>
                  <TableHead className="text-right">Cost (est.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.byModel.map((row) => (
                  <TableRow key={`${row.kind}-${row.model}`}>
                    <TableCell>{KIND_LABEL[row.kind] ?? row.kind}</TableCell>
                    <TableCell className="font-mono text-xs">{row.model}</TableCell>
                    <TableCell className="text-right tabular-nums">{number(row.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{number(row.failedCalls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{number(row.promptTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{number(row.audioInputTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{number(row.completionTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.audioMinutes.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(row.costUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 py-5">
            <h2 className="font-display text-lg font-medium">By day</h2>
            {report.byDay.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing recorded this month.</p>
            ) : (
              <Table data-testid="by-day">
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Practices</TableHead>
                    <TableHead className="text-right">Cost (est.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byDay.map((row) => (
                    <TableRow key={row.day}>
                      <TableCell>{row.day}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.practices}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUsd(row.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 py-5">
            <h2 className="font-display text-lg font-medium">Students using most</h2>
            {report.topStudents.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing recorded this month.</p>
            ) : (
              <Table data-testid="top-students">
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Practices</TableHead>
                    <TableHead className="text-right">Cost (est.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.topStudents.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell>{row.name ?? row.email}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.practices}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatUsd(row.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-muted-foreground text-xs">
        How the cost is estimated: each AI call reports its tokens (and the audio part of them) or its audio minutes; they are multiplied by the list prices kept in the code (override them with the SPEAKING_PRICES_JSON setting
        when a price changes). Your OpenAI billing page has the exact amount.
      </p>
    </div>
  );
}
