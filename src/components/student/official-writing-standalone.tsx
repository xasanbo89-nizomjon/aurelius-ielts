"use client";

import { useCallback, useMemo } from "react";

import { saveWritingSittingDraftAction, submitWritingSittingAction } from "@/actions/writing-sitting.actions";
import type { ExamPreferences } from "@/lib/exam/ui-preferences";
import type { SaveRequest } from "@/lib/writing/draft-engine";
import type { HandInDraft } from "@/lib/writing/save-types";
import { OfficialWritingExam, type HandInOutcome, type WritingExamPart } from "@/components/exam/official/official-writing-exam";

/**
 * Phase J - a Writing task taken on its own, on the official exam screen: one part, a clock counted on the server from the moment
 * "Start test" was pressed (20 minutes for Task 1, 40 for Task 2; none for a draft begun before this screen existed). This wrapper
 * only connects the screen to this sitting's server actions; what is saved and when is the screen's draft engine.
 */
export function OfficialWritingStandalone({
  candidateName,
  preferencesCookieName,
  initialPreferences,
  submissionId,
  part,
  initialRemainingSeconds,
}: {
  candidateName: string;
  preferencesCookieName: string;
  initialPreferences: ExamPreferences;
  submissionId: string;
  part: WritingExamPart;
  initialRemainingSeconds: number | null;
}) {
  // No study-time heartbeat on this screen (the old one pinged the server every 30 s with a slow action, and a page's server actions run
  // one at a time, so it held up the autosave by many seconds). The sitting is credited when it is handed in - see lib/writing-sitting.
  const parts = useMemo(() => [part], [part]);
  const reportHref = `/student/writing/${submissionId}`;

  const save = useCallback(
    (request: SaveRequest) => saveWritingSittingDraftAction({ submissionId, content: request.content, baseUpdatedAt: request.baseUpdatedAt }),
    [submissionId]
  );

  const handIn = useCallback(
    async (drafts: HandInDraft[]): Promise<HandInOutcome> => {
      const mine = drafts.find((draft) => draft.taskId === part.taskId);
      const result = await submitWritingSittingAction({ submissionId, content: mine?.content, baseUpdatedAt: mine?.baseUpdatedAt });
      // Phase O - the server says where the student goes: the AI report, or "Your test has been submitted." when this task's results are hidden.
      if (result.success) return { ok: true, redirectTo: result.nextHref || `/student/writing/${result.submissionId}` };
      return { ok: false, error: result.error, behindTaskId: result.conflict ? part.taskId : undefined };
    },
    [submissionId, part.taskId]
  );

  return (
    <OfficialWritingExam
      candidateName={candidateName}
      preferencesCookieName={preferencesCookieName}
      initialPreferences={initialPreferences}
      attemptKey={`sw:${submissionId}`}
      parts={parts}
      initialRemainingSeconds={initialRemainingSeconds}
      save={save}
      handIn={handIn}
      doneHref={reportHref}
    />
  );
}
