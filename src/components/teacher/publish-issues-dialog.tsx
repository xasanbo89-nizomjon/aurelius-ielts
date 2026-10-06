"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import type { IssueTarget, TestIssue } from "@/lib/exam/test-validation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Where in the editor a problem lives: the editor page puts these ids on its passages, question groups and question rows. */
export function issueHref(testId: string, target: IssueTarget): string {
  const base = `/teacher/tests/${testId}`;
  if (target.questionId) return `${base}#question-${target.questionId}`;
  if (target.partId) return `${base}#passage-${target.partId}`;
  return `${base}#test-top`;
}

/**
 * Publishing is refused with the full list of problems (see validateTestForPublish). Each one says what is wrong in the numbers the student sees and
 * links to the exact question or part to fix.
 */
export function PublishIssuesDialog({ testId, issues, open, onOpenChange }: { testId: string; issues: TestIssue[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" data-testid="publish-issues">
        <DialogHeader>
          <DialogTitle>This test can&apos;t be published yet</DialogTitle>
          <DialogDescription>
            {errors.length} problem{errors.length === 1 ? "" : "s"} to fix first. Students never see an incomplete test.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {errors.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className="border-destructive/30 bg-destructive/5 flex items-start gap-2.5 rounded-xl border p-3 text-sm" data-testid="publish-issue">
              <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">{issue.message}</span>
              <Link href={issueHref(testId, issue.target)} onClick={() => onOpenChange(false)} className="text-accent inline-flex shrink-0 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline">
                Go to it <ArrowRight className="size-3" />
              </Link>
            </li>
          ))}
        </ul>

        {warnings.length > 0 && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs font-medium">Worth a look (does not block publishing)</p>
            <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-xs">
              {warnings.map((issue, index) => (
                <li key={`${issue.code}-w-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
