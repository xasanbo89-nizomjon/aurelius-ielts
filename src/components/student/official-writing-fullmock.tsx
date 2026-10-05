"use client";

import { useCallback } from "react";

import { saveFullMockWritingDraftAction, submitFullMockWritingAction } from "@/actions/full-mock-writing.actions";
import type { ExamPreferences } from "@/lib/exam/ui-preferences";
import type { SaveRequest } from "@/lib/writing/draft-engine";
import type { HandInDraft } from "@/lib/writing/save-types";
import { OfficialWritingExam, type HandInOutcome, type WritingExamPart } from "@/components/exam/official/official-writing-exam";

/**
 * Phase J - the Writing paper of a Full Mock on the official exam screen: Task 1 and Task 2 as Part 1 and Part 2 under ONE 60-minute
 * clock (counted on the server from "Start Writing"). When the clock reaches zero - or the student presses the tick - both parts
 * are handed in together and the sitting moves on to the results. This wrapper only connects the screen to the Full Mock's actions.
 */
export function OfficialWritingFullMock({
  attemptId,
  candidateName,
  preferencesCookieName,
  initialPreferences,
  parts,
  initialRemainingSeconds,
}: {
  attemptId: string;
  candidateName: string;
  preferencesCookieName: string;
  initialPreferences: ExamPreferences;
  parts: WritingExamPart[];
  initialRemainingSeconds: number;
}) {
  const nextHref = `/student/full-mock/attempt/${attemptId}`;

  const save = useCallback(
    (request: SaveRequest) =>
      saveFullMockWritingDraftAction(attemptId, { taskId: request.taskId, content: request.content, submissionId: request.submissionId, baseUpdatedAt: request.baseUpdatedAt }),
    [attemptId]
  );

  const handIn = useCallback(
    async (drafts: HandInDraft[]): Promise<HandInOutcome> => {
      const result = await submitFullMockWritingAction(attemptId, drafts);
      if (result.success) return { ok: true, redirectTo: nextHref };
      return { ok: false, error: result.error, behindTaskId: result.conflicts?.[0] };
    },
    [attemptId, nextHref]
  );

  return (
    <OfficialWritingExam
      candidateName={candidateName}
      preferencesCookieName={preferencesCookieName}
      initialPreferences={initialPreferences}
      attemptKey={`fm:${attemptId}`}
      parts={parts}
      initialRemainingSeconds={initialRemainingSeconds}
      save={save}
      handIn={handIn}
      doneHref={nextHref}
    />
  );
}
