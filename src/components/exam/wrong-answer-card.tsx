import Link from "next/link";
import { XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * A wrong answer on the results page. Phase M2 - the answer, the evidence and the explanation a teacher approved are in the review (written once for every
 * student); this card no longer asks the AI anything, so a student's click can never cost an AI call.
 */
export function WrongAnswerCard({
  resultId,
  label,
  detail,
  prompt,
  answered,
}: {
  resultId: string;
  questionId: string;
  /** "Question 7" / "Questions 22–26" — a grouped row covers several numbered questions. */
  label: string;
  /** e.g. "3/5 correct" for a grouped row that was only partly right. */
  detail?: string;
  prompt: string;
  answered: boolean;
}) {
  return (
    <Card className="py-4">
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2.5">
          <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium">{label}</span>
              {detail && <Badge variant="secondary">{detail}</Badge>}
              {!answered && <Badge variant="outline">Skipped</Badge>}
            </div>
            <p className="text-sm">{prompt}</p>
          </div>
        </div>
        <Link href={`/student/exam/attempt/${resultId}/review`} className="text-accent text-xs font-medium underline underline-offset-2">
          See the answer and the explanation in the review
        </Link>
      </CardContent>
    </Card>
  );
}
