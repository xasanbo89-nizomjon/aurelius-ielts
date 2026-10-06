"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import * as builder from "@/lib/exam/test-builder";
import { TestLockedError } from "@/lib/exam/test-lock";
import { prepareListeningAudioUpload } from "@/lib/full-mock-quick-build";
import type { SignedUpload } from "@/lib/uploads/supabase";
import { attachedAudioSchema, builderModelSchema, newTestSchema } from "@/lib/validations/test-builder";
import { friendlyErrorMessage } from "@/lib/validation-error";

const idSchema = z.string().trim().min(1).max(80);

export type BuilderFailure = { success: false; error: string; conflict?: boolean; locked?: boolean };
export type BuilderActionResult<T = object> = ({ success: true } & T) | BuilderFailure;

function builderFailure(error: unknown, fallback: string): BuilderFailure {
  if (error instanceof builder.BuilderConflictError) return { success: false, error: error.message, conflict: true };
  if (error instanceof TestLockedError) return { success: false, error: error.message, locked: true };
  return { success: false, error: friendlyErrorMessage(error, fallback) };
}

/** Step 3 of the wizard (method "by hand"): the empty test with its parts in place; the editor opens on it. */
export async function createBuilderTestAction(input: unknown): Promise<BuilderActionResult<{ testId: string }>> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = newTestSchema.parse(input);
    const test = await builder.createTestWithParts(profile.id, parsed);
    revalidatePath("/teacher/tests");
    return { success: true, testId: test.id };
  } catch (error) {
    return builderFailure(error, "Could not create the test.");
  }
}

/** The version the next save must be based on (after the cover image was changed, which touches the test's row). */
export async function getBuilderVersionAction(testId: string): Promise<BuilderActionResult<{ version: string }>> {
  try {
    const { profile } = await requireTeacherProfile();
    return { success: true, version: await builder.getBuilderVersion(idSchema.parse(testId), profile.id) };
  } catch (error) {
    return builderFailure(error, "Could not read the test.");
  }
}

/** The editor's autosave: the whole structure in one go, refused if the test moved on (`conflict`) or is frozen (`locked`). */
export async function saveBuilderAction(testId: string, model: unknown, version: string): Promise<BuilderActionResult<builder.SavedBuilder>> {
  try {
    const { profile } = await requireTeacherProfile();
    const saved = await builder.saveBuilder(idSchema.parse(testId), profile.id, builderModelSchema.parse(model), z.string().max(40).parse(version));
    return { success: true, ...saved };
  } catch (error) {
    return builderFailure(error, "Could not save the test.");
  }
}

/** The recording goes from the browser straight to storage with this one-use authorisation (never through a server action). */
export async function prepareBuilderAudioUploadAction(input: { fileName: string; fileSize: number; contentType: string }): Promise<(SignedUpload & { success: true }) | BuilderFailure> {
  try {
    const { profile } = await requireTeacherProfile();
    const upload = await prepareListeningAudioUpload(profile.id, { name: input.fileName, size: input.fileSize, type: input.contentType });
    return { success: true, ...upload };
  } catch (error) {
    return builderFailure(error, "Could not prepare the upload.");
  }
}

/** Attaches the recording the browser just uploaded: to one part, or (no `passageId`) to every part as the one shared recording. Returns the measured lengths. */
export async function attachBuilderAudioAction(testId: string, audio: unknown, passageId?: string): Promise<BuilderActionResult<{ parts: builder.BuilderPartInfo[] }>> {
  try {
    const { profile } = await requireTeacherProfile();
    const result = await builder.attachBuilderAudio(idSchema.parse(testId), profile.id, attachedAudioSchema.parse(audio), passageId ? idSchema.parse(passageId) : undefined);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true, ...result };
  } catch (error) {
    return builderFailure(error, "Could not attach the recording.");
  }
}

export async function removeBuilderAudioAction(testId: string, passageId?: string): Promise<BuilderActionResult<{ parts: builder.BuilderPartInfo[] }>> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    const result = await builder.removeBuilderAudio(id, profile.id, passageId ? idSchema.parse(passageId) : undefined);
    revalidatePath(`/teacher/tests/${id}`);
    return { success: true, ...result };
  } catch (error) {
    return builderFailure(error, "Could not remove the recording.");
  }
}
