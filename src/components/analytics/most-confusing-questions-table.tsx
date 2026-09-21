import { AlertTriangle } from "lucide-react";

import type { MostConfusingQuestionRow } from "@/lib/ai/teacher-insights";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

export function MostConfusingQuestionsTable({ rows }: { rows: MostConfusingQuestionRow[] }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-xl font-medium tracking-tight">Most Confusing Questions</h2>

      {rows.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="Not enough data yet"
          description="Questions with a high wrong-answer rate will appear here once enough students have attempted them."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead>Test</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Incorrect</TableHead>
              <TableHead>Answered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.questionId}>
                <TableCell className="max-w-xs truncate font-medium">{row.prompt}</TableCell>
                <TableCell className="text-muted-foreground">{row.testTitle}</TableCell>
                <TableCell className="text-muted-foreground">{row.questionType}</TableCell>
                <TableCell>
                  <Badge variant="destructive">{row.incorrectPercent}%</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{row.totalAnswers}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
