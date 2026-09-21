import Link from "next/link";

import type { WritingSubmissionSummary } from "@/lib/ai/writing";
import { WRITING_TASK_CATEGORY_LABELS } from "@/lib/labels";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT = {
  DRAFT: "outline",
  PENDING: "outline",
  IN_REVIEW: "outline",
  REVIEWED: "success",
} as const;

const STATUS_LABEL = {
  DRAFT: "Draft",
  PENDING: "Pending",
  IN_REVIEW: "In Review",
  REVIEWED: "Reviewed",
} as const;

export function WritingSubmissionsTable({ submissions }: { submissions: WritingSubmissionSummary[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead>Words</TableHead>
          <TableHead>AI Estimated Band</TableHead>
          <TableHead>Teacher Band</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {submissions.map((submission) => {
          const isDraft = submission.status === "DRAFT";
          const href = isDraft ? `/student/writing/new?draftId=${submission.id}` : `/student/writing/${submission.id}`;
          return (
            <TableRow key={submission.id}>
              <TableCell className="font-medium">
                <Link
                  href={href}
                  className="hover:text-accent focus-visible:text-accent underline-offset-4 outline-none focus-visible:underline"
                >
                  {submission.taskType}
                  {submission.category && (
                    <span className="text-muted-foreground font-normal"> — {WRITING_TASK_CATEGORY_LABELS[submission.category]}</span>
                  )}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {isDraft ? "Not submitted" : submission.createdAt.toLocaleDateString()}
              </TableCell>
              <TableCell className="text-muted-foreground">{submission.wordCount ?? "—"}</TableCell>
              <TableCell>{submission.estimatedBand != null ? submission.estimatedBand.toFixed(1) : "—"}</TableCell>
              <TableCell>{submission.bandScore != null ? submission.bandScore.toFixed(1) : "—"}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[submission.status]}>{STATUS_LABEL[submission.status]}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
