"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { saveWritingSittingDraft, startWritingSitting, submitWritingSitting, type SubmitWritingSittingResult } from "@/lib/writing-sitting";
import type { DraftSaveResult } from "@/lib/writing/save-types";

const idSchema = z.string().trim().min(1).max(64);
/** A draft's version: the ISO timestamp the server last sent back. */
const versionSchema = z.string().max(40).nullish();

const saveSchema = z.object({ submissionId: idSchema, content: z.string().max(8000), baseUpdatedAt: versionSchema });
// `content` may be left out: a window that is behind hands in the text the server already holds.
const submitSchema = z.object({ submissionId: idSchema, content: z.string().max(8000).optional(), baseUpdatedAt: versionSchema });

/** "Start test" on the Writing instructions screen: opens the sitting (the clock starts here) and goes to it. */
export async function startWritingSittingAction(taskId: string, ui?: string) {
  const { profile } = await requireStudentProfile();
  // Real, server-side gate, the same as starting a Reading or Listening test.
  if (!(await hasActiveAccess(profile.id))) redirect("/student/premium?upgrade=1");

  const started = await startWritingSitting(profile.id, idSchema.parse(taskId));
  if (!started.success) redirect("/student/writing/tasks");
  redirect(`/student/writing/new?draftId=${started.submissionId}${ui === "official" || ui === "legacy" ? `&ui=${ui}` : ""}`);
}

/** Autosave of the sitting's text. A thrown error here is a failed request (the screen retries); an `error` result for a known reason (time up, already handed in) is final. */
export async function saveWritingSittingDraftAction(input: unknown): Promise<DraftSaveResult> {
  try {
    const { profile } = await requireStudentProfile();
    return await saveWritingSittingDraft(profile.id, saveSchema.parse(input));
  } catch {
    return { success: false, error: "Could not save your draft." };
  }
}

/** Hands the sitting in - the tick in the footer, or the clock reaching zero. */
export async function submitWritingSittingAction(input: unknown): Promise<SubmitWritingSittingResult> {
  try {
    const { profile } = await requireStudentProfile();
    const result = await submitWritingSitting(profile.id, submitSchema.parse(input));
    if (result.success) {
      revalidatePath("/student/writing");
      revalidatePath("/student/writing/history");
    }
    return result;
  } catch {
    return { success: false, error: "Could not submit your writing. Please try again." };
  }
}
