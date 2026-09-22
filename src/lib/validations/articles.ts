import { z } from "zod";

export const articleDifficultySchema = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);

export const articleSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().trim().max(500).optional(),
  content: z.string().trim().min(1, "Add the article content").max(500000),
  category: z.string().trim().min(1, "Add a category").max(60),
  difficulty: articleDifficultySchema,
  // Deliberately NOT `.url()` — the local-disk fallback returns a relative
  // path (`/uploads/...`), not an absolute URL. Omitted entirely (rather
  // than passed as "") to leave an existing article's cover untouched.
  coverImagePath: z.string().trim().min(1).max(2048).optional(),
});
export type ArticleInput = z.infer<typeof articleSchema>;

export const readingProgressSchema = z.object({
  articleId: z.string().trim().min(1),
  lastPosition: z.number().int().min(0),
  percentComplete: z.number().int().min(0).max(100),
});
export type ReadingProgressInput = z.infer<typeof readingProgressSchema>;
