import Link from "next/link";

import type { TestHistoryRow } from "@/lib/analytics/band-conversation";
import { SKILL_LABELS } from "@/lib/labels";
import { formatDuration } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ClipboardCheck } from "lucide-react";

export function TestHistoryTable({ studentId, rows }: { studentId: string; rows: TestHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Test History</h2>
        <EmptyState icon={ClipboardCheck} title="No completed tests yet" description="Completed Reading and Listening attempts will appear here." />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Test History</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Test Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Date Taken</TableHead>
            <TableHead>Time Spent</TableHead>
            <TableHead>Correct</TableHead>
            <TableHead>Incorrect</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Band</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.resultId} className="hover:bg-secondary/40">
              <TableCell className="font-medium">
                <Link href={`/teacher/band-conversation/${studentId}/attempts/${row.resultId}`} className="hover:underline">
                  {row.testName}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{SKILL_LABELS[row.testType]}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{row.dateTaken.toLocaleDateString()}</TableCell>
              <TableCell className="text-muted-foreground">
                {row.timeSpentSeconds != null ? formatDuration(row.timeSpentSeconds) : "—"}
              </TableCell>
              <TableCell className="text-success tabular-nums">{row.correctAnswers}</TableCell>
              <TableCell className="text-destructive tabular-nums">{row.incorrectAnswers}</TableCell>
              <TableCell className="tabular-nums">
                {row.score != null ? `${row.score}/${row.maxScore}` : "—"}
              </TableCell>
              <TableCell>{row.bandScore != null ? <Badge variant="accent">{row.bandScore.toFixed(1)}</Badge> : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
