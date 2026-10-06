"use client";

import { useCallback, useMemo } from "react";

import { DEFAULT_EXAM_PREFERENCES, type ExamPreferences } from "@/lib/exam/ui-preferences";
import type { SaveRequest } from "@/lib/writing/draft-engine";
import type { HandInDraft } from "@/lib/writing/save-types";
import { OfficialWritingExam, type HandInOutcome, type WritingExamPart } from "@/components/exam/official/official-writing-exam";
import { ExamPreviewShell } from "@/components/teacher/exam-preview-shell";

/**
 * "Preview as student" for a Writing task, or for a Writing test (Task 1 + Task 2 as Part 1 / Part 2): the real official Writing screen. Its two server
 * connections - saving the text and handing it in - are replaced by functions that say "done" without sending anything anywhere, and the clock is off.
 */
export function WritingPreview({ label, exitHref, parts, initialPreferences = DEFAULT_EXAM_PREFERENCES }: { label: string; exitHref: string; parts: WritingExamPart[]; initialPreferences?: ExamPreferences }) {
  // A name of its own for this window's browser copy of the text, so a preview never meets text from an earlier one.
  const attemptKey = useMemo(() => `preview:${parts.map((p) => p.taskId).join("+")}:${Math.random().toString(36).slice(2, 8)}`, [parts]);

  const save = useCallback(async (request: SaveRequest) => {
    void request;
    return { success: true as const, submissionId: "preview", updatedAt: new Date().toISOString() };
  }, []);
  const handIn = useCallback(
    async (drafts: HandInDraft[]): Promise<HandInOutcome> => {
      void drafts;
      return { ok: true, redirectTo: exitHref };
    },
    [exitHref]
  );

  return (
    <ExamPreviewShell exitHref={exitHref} label={label}>
      <OfficialWritingExam
        candidateName="Preview"
        preferencesCookieName="aurelius-teacher-preview-prefs"
        initialPreferences={initialPreferences}
        attemptKey={attemptKey}
        parts={parts}
        initialRemainingSeconds={null}
        save={save}
        handIn={handIn}
        doneHref={exitHref}
      />
    </ExamPreviewShell>
  );
}
