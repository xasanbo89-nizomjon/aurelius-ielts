"use client";

import { useCallback } from "react";

import { saveWritingBundleDraftAction, submitWritingBundleSittingAction } from "@/actions/writing-bundle-sitting.actions";
import type { ExamPreferences } from "@/lib/exam/ui-preferences";
import type { SaveRequest } from "@/lib/writing/draft-engine";
import type { HandInDraft } from "@/lib/writing/save-types";
import { OfficialWritingExam, type HandInOutcome, type WritingExamPart } from "@/components/exam/official/official-writing-exam";

/**
 * Phase L3 - a Writing test (Task 1 + Task 2 made together) taken on its own, on the official exam screen: the two tasks as Part 1 and Part 2 under ONE
 * 60-minute clock counted on the server from "Start test", exactly like the Writing paper of a Full Mock. When the clock reaches zero - or the student presses
 * the tick - both parts are handed in together. This wrapper only connects the screen to the sitting's server actions; what is saved and when is the screen's
 * draft engine.
 */
export function OfficialWritingBundle({
  candidateName,
  preferencesCookieName,
  initialPreferences,
  firstSubmissionId,
  parts,
  initialRemainingSeconds,
  doneHref,
}: {
  candidateName: string;
  preferencesCookieName: string;
  initialPreferences: ExamPreferences;
  /** The sitting's name for the browser's own copy of the text: its first draft. */
  firstSubmissionId: string;
  parts: WritingExamPart[];
  initialRemainingSeconds: number;
  doneHref: string;
}) {
  const save = useCallback(
    (request: SaveRequest) => {
      const part = parts.find((p) => p.taskId === request.taskId);
      return saveWritingBundleDraftAction({ submissionId: request.submissionId ?? part?.submissionId, content: request.content, baseUpdatedAt: request.baseUpdatedAt });
    },
    [parts]
  );

  const handIn = useCallback(
    async (drafts: HandInDraft[]): Promise<HandInOutcome> => {
      const result = await submitWritingBundleSittingAction({ submissionId: firstSubmissionId, drafts });
      // Phase O - the server says where the student goes: the combined AI report, or "Your test has been submitted." when this test's results are hidden.
      if (result.success) return { ok: true, redirectTo: result.nextHref || doneHref };
      return { ok: false, error: result.error, behindTaskId: result.conflicts?.[0] };
    },
    [firstSubmissionId, doneHref]
  );

  return (
    <OfficialWritingExam
      candidateName={candidateName}
      preferencesCookieName={preferencesCookieName}
      initialPreferences={initialPreferences}
      attemptKey={`wb:${firstSubmissionId}`}
      parts={parts}
      initialRemainingSeconds={initialRemainingSeconds}
      save={save}
      handIn={handIn}
      doneHref={doneHref}
    />
  );
}
