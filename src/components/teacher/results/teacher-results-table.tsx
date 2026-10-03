import Link from "next/link";

import type { TeacherResultRow } from "@/lib/analytics/teacher-results";
import { formatDateTime, formatTimeUsed } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccuracyCell, BandCell, FullMockBreakdown, KindBadge, ScoreText, StatusBadge } from "@/components/teacher/results/result-cells";

/** The teacher's all-students results table: one row per real attempt, newest first. */
export function TeacherResultsTable({ rows }: { rows: TeacherResultRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Test</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Date completed</TableHead>
          <TableHead>Time used</TableHead>
          <TableHead title="Marks earned">Correct</TableHead>
          <TableHead title="Marks not earned — wrong answers and skipped questions">Incorrect</TableHead>
          <TableHead>Accuracy</TableHead>
          <TableHead>Band</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} className="hover:bg-secondary/40 align-top">
            <TableCell className="min-w-44">
              <Link href={`/teacher/students/${row.studentId}#results`} className="font-medium hover:underline">
                {row.studentName ?? "—"}
              </Link>
              <p className="text-muted-foreground text-xs">{row.studentEmail}</p>
            </TableCell>
            <TableCell className="min-w-56">
              {row.href ? (
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
              <KindBadge kind={row.kind} />
            </TableCell>
            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
              {row.completedAt ? formatDateTime(row.completedAt) : <>Started {formatDateTime(row.startedAt)}</>}
            </TableCell>
            <TableCell className="tabular-nums whitespace-nowrap">{formatTimeUsed(row.timeUsedSeconds)}</TableCell>
            <TableCell className="tabular-nums">{row.correct ?? <span className="text-muted-foreground">—</span>}</TableCell>
            <TableCell className="tabular-nums">{row.incorrect ?? <span className="text-muted-foreground">—</span>}</TableCell>
            <TableCell>
              <AccuracyCell value={row.accuracyPercent} />
            </TableCell>
            <TableCell>
              <BandCell row={row} />
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

// Re-exported so callers that only need the score text don't import two modules.
export { ScoreText };
