import { Coins, Cpu, Gauge, PenLine, Sigma } from "lucide-react";

import type { WritingUsageReport } from "@/lib/writing-assessment/usage";
import { formatUsd } from "@/lib/writing-assessment/cost";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WritingDailyLimitForm } from "@/components/teacher/writing-assessment/daily-limit-form";

const KIND_LABEL: Record<string, string> = { TASK_1: "Task 1 (with the picture)", TASK_1_RETRY: "Task 1, second try", TASK_2: "Task 2", TASK_2_RETRY: "Task 2, second try" };
const number = (value: number) => value.toLocaleString("en-US");

/** Phase O - the Writing half of the Root Teacher's AI usage page: the same month, the same kind of numbers, from the Writing usage log. */
export function WritingUsageSection({ report, limit, model }: { report: WritingUsageReport; limit: number; model: string }) {
  return (
    <section className="space-y-6" data-testid="writing-usage">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-medium tracking-tight">Writing AI usage and cost</h2>
        <p className="text-muted-foreground text-sm">What the AI assessment of Writing sittings has used this month, from its usage log. Costs are estimates.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="writing-usage-stats">
        <StatCard label="Cost this month (estimate)" value={formatUsd(report.totals.costUsd)} icon={Coins} caption={`${number(report.totals.calls)} AI calls, ${report.totals.failedCalls} failed`} />
        <StatCard
          label="Cost of one assessment"
          value={report.averageCostPerAssessmentUsd == null ? "-" : formatUsd(report.averageCostPerAssessmentUsd)}
          icon={Sigma}
          caption={report.assessedSample > 0 ? `measured on the last ${report.assessedSample} assessed sittings` : "no assessed sitting yet"}
        />
        <StatCard label="Sittings assessed" value={number(report.assessments.done)} icon={PenLine} caption={`${report.assessments.created} queued, ${report.assessments.failed} failed, ${report.assessments.waiting} waiting`} />
        <StatCard label="Tokens" value={number(report.totals.promptTokens + report.totals.completionTokens)} icon={Cpu} caption={`${number(report.totals.promptTokens)} read, ${number(report.totals.completionTokens)} written`} />
      </div>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h3 className="font-display flex items-center gap-2 text-lg font-medium">
            <Gauge className="text-accent size-5" /> Daily limit
          </h3>
          <p className="text-muted-foreground text-sm">
            Each student may have <strong className="text-foreground">{limit}</strong> Writing sitting{limit === 1 ? "" : "s"} assessed a day (the day turns over at midnight Tashkent time). The limit never stops a hand-in: the essays are always
            saved; an assessment over the limit waits and can be run again with Try again, tomorrow or after the limit is raised. A retry of the same sitting does not count twice.
          </p>
          <WritingDailyLimitForm current={limit} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h3 className="font-display flex items-center gap-2 text-lg font-medium">
            <Cpu className="text-accent size-5" /> By model
          </h3>
          <p className="text-muted-foreground text-xs" data-testid="writing-models-in-use">
            In use now: <Badge variant="outline">{model}</Badge> (OPENAI_WRITING_ASSESS_MODEL, or OPENAI_MODEL when it is not set)
          </p>
          {report.byModel.length === 0 ? (
            <p className="text-muted-foreground text-sm">No AI calls this month.</p>
          ) : (
            <Table data-testid="writing-by-model">
              <TableHeader>
                <TableRow>
                  <TableHead>Call</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Prompt tokens</TableHead>
                  <TableHead className="text-right">Output tokens</TableHead>
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
                    <TableCell className="text-right tabular-nums">{number(row.completionTokens)}</TableCell>
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
            <h3 className="font-display text-lg font-medium">By day</h3>
            {report.byDay.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing assessed this month.</p>
            ) : (
              <Table data-testid="writing-by-day">
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Sittings</TableHead>
                    <TableHead className="text-right">Cost (est.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byDay.map((row) => (
                    <TableRow key={row.day}>
                      <TableCell>{row.day}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.assessments}</TableCell>
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
            <h3 className="font-display text-lg font-medium">Students using most</h3>
            {report.topStudents.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing assessed this month.</p>
            ) : (
              <Table data-testid="writing-top-students">
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Sittings</TableHead>
                    <TableHead className="text-right">Cost (est.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.topStudents.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell>{row.name ?? row.email}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.assessments}</TableCell>
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
        How the cost is estimated: each AI call reports its tokens (the picture of Task 1 is part of them); they are multiplied by the list prices kept in the code (override them with the WRITING_PRICES_JSON setting when a price changes).
        Your OpenAI billing page has the exact amount.
      </p>
    </section>
  );
}
