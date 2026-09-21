import { Sparkles } from "lucide-react";

import type { MostRequestedExplanationRow } from "@/lib/ai/teacher-insights";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export function MostRequestedExplanationsTable({ rows }: { rows: MostRequestedExplanationRow[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Most Requested Explanations</h2>

      {rows.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No explanations requested yet"
          description="Once students use Explain More, the most-requested questions will appear here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead>Test</TableHead>
              <TableHead>Requests</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.questionId}>
                <TableCell className="max-w-xs truncate font-medium">{row.prompt}</TableCell>
                <TableCell className="text-muted-foreground">{row.testTitle}</TableCell>
                <TableCell>
                  <Badge variant="accent">{row.requestCount}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
