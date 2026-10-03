import Link from "next/link";
import { BookOpen, Clock, Gauge, Headphones, PenLine, Target, TrendingDown, TrendingUp, ClipboardCheck } from "lucide-react";

import type { ResultKind, StudentResultsHistory, TeacherResultRow } from "@/lib/analytics/teacher-results";
import { SKILL_LABELS } from "@/lib/analytics/teacher-results";
import { formatDateTime, formatRelativeTime, formatTimeUsed } from "@/lib/format";
import { StatCard } from "@/components/dashboard/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccuracyCell, BandCell, FullMockBreakdown, ScoreText, StatusBadge } from "@/components/teacher/results/result-cells";

const SECTIONS: { kind: ResultKind; key: keyof Pick<StudentResultsHistory, "reading" | "listening" | "writing" | "fullMock">; title: string; empty: string }[] = [
  { kind: "READING", key: "reading", title: "Reading attempts", empty: "This student hasn't started a Reading test yet." },
  { kind: "LISTENING", key: "listening", title: "Listening attempts", empty: "This student hasn't started a Listening test yet." },
  { kind: "WRITING", key: "writing", title: "Writing submissions", empty: "This student hasn't submitted a Writing essay yet." },
  { kind: "FULL_MOCK", key: "fullMock", title: "Full Mock attempts", empty: "This student hasn't sat a Full Mock yet." },
];

function HistoryTable({ rows }: { rows: TeacherResultRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Test</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Band</TableHead>
          <TableHead>Accuracy</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Completed</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} className="hover:bg-secondary/40 align-top">
            <TableCell className="min-w-56">
              {row.href && row.kind !== "FULL_MOCK" ? (
                <Link href={row.href} className="font-medium hover:underline">
                  {row.testTitle}
                </Link>
              ) : (
                <span className="font-medium">{row.testTitle}</span>
              )}
              {row.partOfFullMock && <p className="text-muted-foreground text-xs">Part of Full Mock: {row.partOfFullMock}</p>}
              <FullMockBreakdown row={row} />
            </TableCell>
            <TableCell>
              <ScoreText row={row} />
            </TableCell>
            <TableCell>
              <BandCell row={row} />
            </TableCell>
            <TableCell>
              <AccuracyCell value={row.accuracyPercent} />
            </TableCell>
            <TableCell className="tabular-nums whitespace-nowrap">{formatTimeUsed(row.timeUsedSeconds)}</TableCell>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
              {row.completedAt ? formatDateTime(row.completedAt) : <>Started {formatDateTime(row.startedAt)}</>}
            </TableCell>
            <TableCell>
              <StatusBadge row={row} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const SECTION_ICON = { READING: BookOpen, LISTENING: Headphones, WRITING: PenLine, FULL_MOCK: ClipboardCheck } as const;

/** The "Results" block of a student's profile: the performance summary, then every attempt grouped as Reading / Listening / Writing / Full Mock. */
export function StudentResultsHistorySection({ history }: { history: StudentResultsHistory }) {
  const { summary } = history;

  return (
    <section id="results" className="scroll-mt-24 space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-medium tracking-tight">Test results</h2>
        <p className="text-muted-foreground text-sm">
          Every attempt this student has made.{" "}
          <Link href={`/teacher/results?student=${summary.studentId}`} className="text-accent underline">
            Open in the results dashboard
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Tests taken" value={String(summary.totalTests)} icon={ClipboardCheck} />
        <StatCard label="Average band" value={summary.averageBand != null ? summary.averageBand.toFixed(1) : "—"} icon={Gauge} />
        <StatCard label="Average accuracy" value={summary.averageAccuracy != null ? `${summary.averageAccuracy}%` : "—"} icon={Target} />
        <StatCard label="Latest activity" value={summary.latestActivity ? formatRelativeTime(summary.latestActivity) : "Never"} icon={Clock} />
        <StatCard
          label="Strongest skill"
          value={summary.strongestSkill ? SKILL_LABELS[summary.strongestSkill] : "—"}
          caption={summary.strongestSkill ? `Band ${summary.skillAverages[summary.strongestSkill]?.toFixed(1)}` : "Needs a scored test"}
          icon={TrendingUp}
        />
        <StatCard
          label="Weakest skill"
          value={summary.weakestSkill ? SKILL_LABELS[summary.weakestSkill] : "—"}
          caption={summary.weakestSkill ? `Band ${summary.skillAverages[summary.weakestSkill]?.toFixed(1)}` : "Needs two skills to compare"}
          icon={TrendingDown}
        />
      </div>

      {SECTIONS.map(({ kind, key, title, empty }) => {
        const rows = history[key];
        const Icon = SECTION_ICON[kind];
        return (
          <div key={kind} className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Icon className="text-accent size-4" aria-hidden="true" /> {title}
              <span className="text-muted-foreground text-xs font-normal">({rows.length})</span>
            </h3>
            {rows.length === 0 ? <p className="text-muted-foreground border-border/70 rounded-xl border border-dashed px-4 py-5 text-sm">{empty}</p> : <HistoryTable rows={rows} />}
          </div>
        );
      })}
    </section>
  );
}
