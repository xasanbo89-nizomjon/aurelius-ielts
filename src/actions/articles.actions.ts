"use server";

import { revalidatePath } from "next/cache";
import type { ArticleStatus } from "@prisma/client";

import { requireTeacherProfile } from "@/lib/session";
import * as articles from "@/lib/articles";
import { uploadArticleCoverImage } from "@/lib/uploads/image-storage";
import { prepareArticleAudioUpload } from "@/lib/uploads/audio-storage";
import { articleSchema, type ArticleInput } from "@/lib/validations/articles";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function createArticleAction(input: ArticleInput): Promise<ActionResult & { articleId?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = articleSchema.parse(input);
    const article = await articles.createArticle(profile.id, parsed);
    revalidatePath("/teacher/articles");
    return { success: true, articleId: article.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the article.") };
  }
}

export async function updateArticleAction(articleId: string, input: ArticleInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = articleSchema.parse(input);
    await articles.updateArticle(articleId, profile.id, parsed);
    revalidatePath(`/teacher/articles/${articleId}`);
    revalidatePath("/teacher/articles");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the article.") };
  }
}

export async function setArticleStatusAction(articleId: string, status: ArticleStatus): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await articles.setArticleStatus(articleId, profile.id, status);
    revalidatePath(`/teacher/articles/${articleId}`);
    revalidatePath("/teacher/articles");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the article's status.") };
  }
}

export async function deleteArticleAction(articleId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await articles.deleteArticle(articleId, profile.id);
    revalidatePath("/teacher/articles");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the article.") };
  }
}

export type UploadArticleCoverResult =
  | { success: true; path: string; fileName: string; mimeType: string; size: number }
  | { success: false; error: string };

export async function uploadArticleCoverImageAction(formData: FormData): Promise<UploadArticleCoverResult> {
  try {
    const { profile } = await requireTeacherProfile();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "No file was provided." };
    }

    const uploaded = await uploadArticleCoverImage(profile.id, file);
    return { success: true, ...uploaded };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not upload the cover image.") };
  }
}

export type PrepareArticleAudioUploadResult =
  | { success: true; signedUrl: string; token: string; path: string; publicUrl: string }
  | { success: false; error: string };

/**
 * Returns a short-lived, single-object upload authorization instead of
 * accepting the file itself — this request/response never carries file
 * bytes, so it's completely unaffected by Vercel's serverless function
 * body-size ceiling no matter how large the audio file is. The browser
 * uploads directly to Supabase using the returned signedUrl/token; see
 * src/lib/uploads/audio-storage.ts (prepareArticleAudioUpload) and
 * src/lib/uploads/supabase.ts (createSignedUploadUrl) for why.
 */
export async function prepareArticleAudioUploadAction(input: {
  fileName: string;
  fileSize: number;
  contentType: string;
}): Promise<PrepareArticleAudioUploadResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const upload = await prepareArticleAudioUpload(profile.id, {
      name: input.fileName,
      size: input.fileSize,
      type: input.contentType,
    });
    return { success: true, ...upload };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not prepare the audio upload.") };
  }
}
