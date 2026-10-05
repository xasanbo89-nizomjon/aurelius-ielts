"use server";

import { z } from "zod";

import { requireStudentProfile } from "@/lib/session";
import { MAX_LATE_TEXT_CHARS, recordLateTextFromBrowser, type LateTextOutcome } from "@/lib/writing-late-text";

const lateTextSchema = z.object({
  attemptKey: z.string().trim().min(3).max(80),
  taskId: z.string().trim().min(1).max(64),
  content: z.string().max(MAX_LATE_TEXT_CHARS * 2),
  /** When the browser last held the words (ms since 1970, the browser's clock). */
  savedAt: z.number().finite().nullish(),
});

/**
 * Phase K - the browser still holds words of an essay that was handed in without them (the paper ended while the student was offline):
 * keep them as "late text" for the teacher. Never touches the submission itself. A thrown / failed request is simply retried later by the browser.
 */
export async function uploadLateWritingTextAction(input: unknown): Promise<{ outcome: LateTextOutcome | "error" }> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = lateTextSchema.parse(input);
    return { outcome: await recordLateTextFromBrowser(profile.id, { attemptKey: parsed.attemptKey, taskId: parsed.taskId, content: parsed.content, clientSavedAt: parsed.savedAt ?? null }) };
  } catch {
    return { outcome: "error" };
  }
}
