import type { LucideIcon } from "lucide-react";
import { BookOpen, ClipboardCheck, Headphones, PenLine } from "lucide-react";

import type { ResultKind, TeacherResultRow } from "@/lib/analytics/teacher-results";
import { Badge } from "@/components/ui/badge";

export const KIND_META: Record<ResultKind, { label: string; icon: LucideIcon; variant: "accent" | "outline" | "secondary" | "default" }> = {
  READING: { label: "Reading", icon: BookOpen, variant: "accent" },
  LISTENING: { label: "Listening", icon: Headphones, variant: "outline" },
  WRITING: { label: "Writing", icon: PenLine, variant: "secondary" },
  FULL_MOCK: { label: "Full Mock", icon: ClipboardCheck, variant: "default" },
};

export function KindBadge({ kind }: { kind: ResultKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon aria-hidden="true" /> {meta.label}
    </Badge>
  );
}

export function BandCell({ row }: { row: TeacherResultRow }) {
  if (row.bandScore != null) return <Badge variant="accent">{row.bandScore.toFixed(1)}</Badge>;
  // A Writing essay / Full Mock that is in but not graded yet is different from one that was never finished.
  if (row.kind === "WRITING" || (row.kind === "FULL_MOCK" && row.status === "COMPLETED")) return <span className="text-muted-foreground text-xs">Pending</span>;
  return <span className="text-muted-foreground">—</span>;
}

export function AccuracyCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <Badge variant={value >= 70 ? "success" : "outline"}>{value}%</Badge>;
}

const STATUS_VARIANT: Record<string, "success" | "outline" | "accent"> = {
  Completed: "success",
  "In progress": "outline",
  Submitted: "outline",
  "In review": "accent",
  Reviewed: "success",
};

export function StatusBadge({ row }: { row: TeacherResultRow }) {
  return <Badge variant={STATUS_VARIANT[row.statusLabel] ?? "outline"}>{row.statusLabel}</Badge>;
}

/** "31 / 40" — or an em dash where the record has no marks (Writing, unfinished attempts). */
export function ScoreText({ row }: { row: TeacherResultRow }) {
  if (row.correct == null || row.total == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {row.correct} / {row.total}
    </span>
  );
}

/** The Full Mock breakdown a teacher needs at a glance: Listening and Reading scores, the Writing leg's status, and the overall band. */
export function FullMockBreakdown({ row }: { row: TeacherResultRow }) {
  const detail = row.fullMock;
  if (!detail) return null;

  const section = (label: string, value: { correct: number; total: number; bandScore: number | null } | null) => (
    <span className="whitespace-nowrap">
      <span className="text-foreground/80 font-medium">{label}</span>{" "}
      {value ? (
        <>
          {value.correct}/{value.total}
          {value.bandScore != null && <> · band {value.bandScore.toFixed(1)}</>}
        </>
      ) : (
        "not finished"
      )}
    </span>
  );

  return (
    <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
      {section("Listening", detail.listening)}
      {section("Reading", detail.reading)}
      {detail.writingStatus != null && (
        <span className="whitespace-nowrap">
          <span className="text-foreground/80 font-medium">Writing</span> {detail.writingStatus}
          {detail.writingBand != null && <> · band {detail.writingBand.toFixed(1)}</>}
        </span>
      )}
      <span className="whitespace-nowrap">
        <span className="text-foreground/80 font-medium">Overall</span> {detail.overallBand != null ? detail.overallBand.toFixed(1) : "pending"}
      </span>
    </div>
  );
}
