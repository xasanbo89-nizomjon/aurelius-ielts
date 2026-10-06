"use client";

import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";

import type { IssueTarget, TestValidation } from "@/lib/exam/test-validation";
import { REQUIRED_QUESTIONS } from "@/lib/exam/test-validation";
import { cn } from "@/lib/utils";

/**
 * The publish checklist, live: the SAME rules the publish button enforces (validateTestStructure), run on what is in the editor right now. Every problem
 * is written in the numbers the student sees and jumps to the element to fix.
 */
export function ChecklistPanel({ validation, onGo, className }: { validation: TestValidation; onGo: (target: IssueTarget) => void; className?: string }) {
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  const warnings = validation.issues.filter((issue) => issue.severity === "warning");

  return (
    <aside className={cn("border-border/70 bg-card space-y-3 rounded-2xl border p-4", className)} data-testid="checklist" data-ready={validation.ok}>
      <div className="flex items-center gap-2">
        {validation.ok ? <CheckCircle2 className="text-success size-5" /> : <CircleAlert className="text-destructive size-5" />}
        <h2 className="font-display text-base font-medium">{validation.ok ? "Ready to publish" : "Before you can publish"}</h2>
      </div>

      <p className="text-sm" data-testid="checklist-total">
        <span className={cn("font-semibold tabular-nums", validation.total === REQUIRED_QUESTIONS ? "text-success" : "text-foreground")}>{validation.total}</span> of {REQUIRED_QUESTIONS} questions
        {validation.parts.length > 0 && <span className="text-muted-foreground"> · {validation.parts.map((p) => p.count).join(" / ")}</span>}
      </p>

      {errors.length > 0 ? (
        <ul className="space-y-1.5" data-testid="checklist-errors">
          {errors.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              <button type="button" onClick={() => onGo(issue.target)} className="hover:bg-secondary/60 flex w-full items-start gap-2 rounded-lg p-1.5 text-left text-xs" data-testid="checklist-issue">
                <AlertTriangle className="text-destructive mt-0.5 size-3.5 shrink-0" />
                <span>{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">Every check passes: {validation.total} numbered questions, each with an answer.</p>
      )}

      {warnings.length > 0 && (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs" data-testid="checklist-warnings">
          {warnings.map((issue, index) => (
            <li key={`${issue.code}-w-${index}`}>
              <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onGo(issue.target)}>
                {issue.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
