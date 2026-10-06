"use client";

import { useMemo, type ReactNode } from "react";
import { Eye } from "lucide-react";

import { ExamActionsProvider, previewExamActions } from "@/components/exam/exam-actions";

/**
 * "Preview as student": the real exam screen, drawn under a banner that says so, with every write to the server replaced by a no-op (see exam-actions).
 * The exam fills "the screen", so it is placed in a box below the banner: a transformed box is the reference for the exam's own fixed positioning.
 */
export function ExamPreviewShell({ exitHref, label, children }: { exitHref: string; label: string; children: ReactNode }) {
  const actions = useMemo(() => previewExamActions(exitHref), [exitHref]);
  return (
    <ExamActionsProvider value={actions}>
      <div className="fixed inset-x-0 top-0 z-[200] flex h-10 items-center justify-center gap-3 bg-amber-300 px-3 text-sm font-medium text-black" role="status" data-testid="preview-banner">
        <Eye className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">
          PREVIEW - {label}. Nothing here is saved: no attempt, answers, highlights, notes or study time.
        </span>
        <a href={exitHref} className="shrink-0 rounded-md bg-black/85 px-2.5 py-1 text-xs text-white underline-offset-2 hover:bg-black" data-testid="preview-exit">
          Exit preview
        </a>
      </div>
      <div className="fixed inset-x-0 top-10 bottom-0" style={{ transform: "translateZ(0)" }} data-testid="preview-stage">
        {children}
      </div>
    </ExamActionsProvider>
  );
}
