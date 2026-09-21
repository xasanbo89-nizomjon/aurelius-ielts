import { AlertTriangle, FileQuestion } from "lucide-react";

import type { QuestionAnalyticsRow } from "@/lib/analytics/teacher-insights";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";

const DIFFICULT_THRESHOLD = 50;

export function QuestionAnalyticsTable({ questions }: { questions: QuestionAnalyticsRow[] }) {
  const answered = questions.filter((q) => q.totalAnswers > 0);
  const difficult = answered.filter((q) => (q.correctPercent ?? 100) < DIFFICULT_THRESHOLD);

  if (questions.length === 0) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No questions yet"
        description="Add questions to this test to see analytics here."
      />
    );
  }

  if (answered.length === 0) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No attempts yet"
        description="Question-level accuracy will appear once students complete this test."
      />
    );
  }

  return (
    <div className="space-y-4">
      {difficult.length > 0 && (
        <div className="border-destructive/20 bg-destructive/5 text-destructive flex items-start gap-2 rounded-xl border px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {difficult.length} question{difficult.length === 1 ? "" : "s"} below {DIFFICULT_THRESHOLD}% correct —
            worth a second look.
          </span>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Question</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Correct</TableHead>
            <TableHead>Incorrect</TableHead>
            <TableHead>Answered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((question) => (
            <TableRow key={question.questionId}>
              <TableCell className="text-muted-foreground">{question.number}</TableCell>
              <TableCell className="max-w-xs truncate font-medium">{question.prompt}</TableCell>
              <TableCell className="text-muted-foreground">{QUESTION_TYPE_META[question.type].label}</TableCell>
              <TableCell>
                {question.correctPercent != null ? (
                  <Badge variant={question.correctPercent < DIFFICULT_THRESHOLD ? "destructive" : "success"}>
                    {question.correctPercent}%
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {question.incorrectPercent != null ? `${question.incorrectPercent}%` : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">{question.totalAnswers}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
