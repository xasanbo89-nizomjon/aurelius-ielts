import Link from "next/link";
import { History } from "lucide-react";

import type { ProgressPoint } from "@/lib/analytics/student-insights";
import { SKILL_LABELS } from "@/lib/labels";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";

export function ProgressHistoryTable({ history }: { history: ProgressPoint[] }) {
  const recent = [...history].reverse().slice(0, 8);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-medium tracking-tight">Progress History</h2>
        {history.length > 0 && (
          <Button asChild variant="outline" size="sm">
            <Link href="/student/test-history">View full history</Link>
          </Button>
        )}
      </div>

      {recent.length === 0 ? (
        <EmptyState icon={History} title="No completed tests yet" description="Your recent attempts will be listed here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Band</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((point) => (
              <TableRow key={point.id}>
                <TableCell className="text-muted-foreground">
                  {point.completedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </TableCell>
                <TableCell>{SKILL_LABELS[point.skill as "READING" | "LISTENING"]}</TableCell>
                <TableCell>
                  {point.rawScore ?? 0}/{point.maxScore}
                </TableCell>
                <TableCell>
                  {point.bandScore != null ? (
                    <Badge variant="accent">{point.bandScore.toFixed(1)}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
