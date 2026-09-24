import Link from "next/link";

import type { ResultSummaryCard } from "@/lib/analytics/student-insights";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";

export function TestHistoryTab({ results }: { results: ResultSummaryCard[] }) {
  if (results.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No completed tests yet"
        description="Once you finish a Reading or Listening test, it'll show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Test</TableHead>
            <TableHead>Module</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Band</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => (
            <TableRow key={result.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/student/exam/attempt/${result.id}/results`}
                  className="hover:text-accent focus-visible:text-accent underline-offset-4 outline-none focus-visible:underline"
                >
                  {result.testTitle}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground capitalize">{result.skill.toLowerCase()}</TableCell>
              <TableCell className="text-muted-foreground">
                {result.completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </TableCell>
              <TableCell>
                {result.rawScore ?? 0}/{result.maxScore}
              </TableCell>
              <TableCell>
                {result.bandScore != null ? <Badge variant="accent">{result.bandScore.toFixed(1)}</Badge> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {result.durationSeconds != null ? `${Math.round(result.durationSeconds / 60)} min` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button asChild variant="outline" size="sm">
        <Link href="/student/test-history">View full test history</Link>
      </Button>
    </div>
  );
}
