"use server";

import { z } from "zod";

import { requireStudentProfile } from "@/lib/session";
import {
  finalizeFullMockWriting,
  markUnmarkedFullMockWriting,
  saveFullMockWritingDraft,
  type FinalizeFullMockWritingResult,
  type SaveFullMockDraftResult,
} from "@/lib/full-mock-writing";

const idSchema = z.string().trim().min(1).max(64);
/** A draft's version: the ISO timestamp the server last sent back (Phase J). */
const versionSchema = z.string().max(40).nullish();

const draftSchema = z.object({
  taskId: idSchema,
  content: z.string().max(8000),
  submissionId: idSchema.nullish(),
  baseUpdatedAt: versionSchema,
});

// `content` may be left out: a window that is behind hands in the text the server already holds (Phase J).
const finalizeSchema = z.array(z.object({ taskId: idSchema, content: z.string().max(8000).optional(), baseUpdatedAt: versionSchema })).max(4);

/** Autosave of one Full Mock Writing task. Called every second or so while the student types. */
export async function saveFullMockWritingDraftAction(attemptId: string, input: unknown): Promise<SaveFullMockDraftResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = draftSchema.parse(input);
    return await saveFullMockWritingDraft(idSchema.parse(attemptId), profile.id, parsed);
  } catch {
    return { success: false, error: "Could not save your draft." };
  }
}

/** Hands in every task of the Writing session — the Submit button, or the clock reaching zero. */
export async function submitFullMockWritingAction(attemptId: string, drafts: unknown): Promise<FinalizeFullMockWritingResult> {
  try {
    const { profile } = await requireStudentProfile();
    return await finalizeFullMockWriting(idSchema.parse(attemptId), profile.id, finalizeSchema.parse(drafts));
  } catch {
    return { success: false, error: "Could not submit your writing. Please try again." };
  }
}

export type MarkFullMockWritingResult = { success: true; marked: number; remaining: number } | { success: false; error: string };

/** The "Mark my Writing" button on the results page: asks the AI marker again for any essay that was handed in but is still without a band. */
export async function markFullMockWritingAction(attemptId: string): Promise<MarkFullMockWritingResult> {
  try {
    const { profile } = await requireStudentProfile();
    const outcome = await markUnmarkedFullMockWriting(idSchema.parse(attemptId), profile.id);
    return { success: true, ...outcome };
  } catch {
    return { success: false, error: "Could not reach the marker. Please try again in a moment." };
  }
}
