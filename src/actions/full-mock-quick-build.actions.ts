"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import * as quickBuild from "@/lib/full-mock-quick-build";
import { createWritingTaskSchema } from "@/lib/validations/writing";
import { friendlyErrorMessage } from "@/lib/validation-error";
import type { SignedUpload } from "@/lib/uploads/supabase";

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type PrepareAudioUploadResult = (SignedUpload & { success: true }) | { success: false; error: string };

export async function prepareQuickBuildAudioUploadAction(input: { fileName: string; fileSize: number; contentType: string }): Promise<PrepareAudioUploadResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const upload = await quickBuild.prepareListeningAudioUpload(profile.id, { name: input.fileName, size: input.fileSize, type: input.contentType });
    return { success: true, ...upload };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not prepare the audio upload.") };
  }
}

export type ImportReadinessResult = ({ success: true } & quickBuild.ImportReadiness) | { success: false; error: string };

/** After a PDF has been analysed: is it complete enough to build from (every question found, every answer matched)? */
export async function getQuickBuildImportReadinessAction(importedTestId: string): Promise<ImportReadinessResult> {
  try {
    const { profile } = await requireTeacherProfile();
    return { success: true, ...(await quickBuild.getImportReadiness(importedTestId, profile.id)) };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not check this PDF.") };
  }
}

export type AnalyzeWritingResult =
  | { success: true; tasks: Awaited<ReturnType<typeof quickBuild.analyzeWritingTaskPdf>>["tasks"]; ocrPageCount: number }
  | { success: false; error: string };

export async function analyzeQuickBuildWritingPdfAction(input: { pdfPath: string; title: string }): Promise<AnalyzeWritingResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const analysis = await quickBuild.analyzeWritingTaskPdf(profile.id, input.pdfPath, input.title.trim() || "Full Mock");
    if (analysis.problems.length > 0) return { success: false, error: analysis.problems.join(" ") };
    return { success: true, tasks: analysis.tasks, ocrPageCount: analysis.ocrPageCount };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not read the Writing PDF.") };
  }
}

export type QuickBuildSuggestionsResult = { success: true; nextExamNumber: number } | { success: false; error: string };

/** Generated metadata the review step pre-fills (the teacher can change any of it). */
export async function getQuickBuildSuggestionsAction(): Promise<QuickBuildSuggestionsResult> {
  try {
    const { profile } = await requireTeacherProfile();
    return { success: true, nextExamNumber: await quickBuild.suggestNextExamNumber(profile.id) };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not prepare the mock details.") };
  }
}

const writingTaskInputSchema = createWritingTaskSchema;

const buildInputSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(["CAMBRIDGE", "GENERAL"]),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  examNumber: z.number().int().min(1).max(9999).optional(),
  estimatedBandMin: z.number().min(0).max(9).optional(),
  estimatedBandMax: z.number().min(0).max(9).optional(),
  accessCodes: z
    .object({
      count: z.number().int().min(1, "Create at least 1 code.").max(200, "At most 200 codes at a time."),
      maxRedemptions: z.number().int().min(1).max(10_000).nullable(),
    })
    .optional(),
  writingPdfPath: z.string().trim().min(1).max(1024).optional(),
  readingImportId: z.string().trim().min(1),
  listeningImportId: z.string().trim().min(1),
  audio: z.object({
    url: z.string().trim().min(1),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(100),
    size: z.number().int().positive(),
  }),
  writingTasks: z.array(z.unknown()).length(2, "Both Writing tasks are needed."),
  publish: z.boolean(),
});

export type BuildFullMockResult = ({ success: true } & quickBuild.QuickBuildResult) | { success: false; error: string };

export async function buildFullMockFromFilesAction(input: unknown): Promise<BuildFullMockResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = buildInputSchema.parse(input);

    // Re-validated server-side with the real Writing task rules (category must belong to the task number, prompt length…) — the preview the client holds is never trusted.
    if (parsed.estimatedBandMin != null && parsed.estimatedBandMax != null && parsed.estimatedBandMin > parsed.estimatedBandMax) {
      throw new Error("The estimated band range is the wrong way round — the minimum must not be above the maximum.");
    }

    const writingTasks = parsed.writingTasks.map((task) => {
      const validated = writingTaskInputSchema.parse({ ...(task as object), assignedStudentIds: [] });
      return {
        taskNumber: validated.taskNumber,
        trainingType: validated.trainingType,
        category: validated.category,
        title: validated.title,
        prompt: validated.prompt,
        visualDescription: validated.visualDescription,
      };
    });

    const result = await quickBuild.buildFullMockFromImports(profile.id, { ...parsed, writingTasks });
    revalidatePath("/teacher/tests");
    revalidatePath("/teacher/tests/import");
    revalidatePath("/teacher/mock-results");
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not build the full mock.") };
  }
}
