import Link from "next/link";
import { FileText } from "lucide-react";

import type { TestPerformanceRow } from "@/lib/analytics/teacher-insights";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export function TestPerformanceTable({ tests }: { tests: TestPerformanceRow[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Test Performance</h2>

      {tests.length === 0 ? (
        <EmptyState icon={FileText} title="No tests yet" description="Create a test to start seeing performance data." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Test</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Completion Rate</TableHead>
              <TableHead>Average Score</TableHead>
              <TableHead>Avg. Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tests.map((test) => (
              <TableRow key={test.testId}>
                <TableCell className="font-medium">
                  <Link
                    href={`/teacher/tests/${test.testId}/analytics`}
                    className="hover:text-accent focus-visible:text-accent underline-offset-4 outline-none focus-visible:underline"
                  >
                    {test.title}
                  </Link>
                </TableCell>
                <TableCell>{test.attempts}</TableCell>
                <TableCell>
                  {test.completionRate != null ? (
                    <Badge variant="outline">{test.completionRate}%</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{test.avgScorePercent != null ? `${test.avgScorePercent}%` : "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {test.avgDurationSeconds != null ? `${Math.round(test.avgDurationSeconds / 60)} min` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
