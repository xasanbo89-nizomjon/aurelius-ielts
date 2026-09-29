/**
 * Phase 36 — Part 11. IELTS Reading skills a teacher can tag an article
 * with, stored as JSON string[] on Article.skillTags (see schema.prisma —
 * same "Json + TS-validated union" convention as Result.flaggedQuestionIds,
 * chosen so the tag set can evolve without a migration).
 */
export const ARTICLE_SKILL_TAGS = [
  "SKIMMING",
  "SCANNING",
  "MATCHING_HEADINGS",
  "TRUE_FALSE_NOT_GIVEN",
  "SUMMARY_COMPLETION",
  "VOCABULARY_BUILDING",
] as const;

export type ArticleSkillTag = (typeof ARTICLE_SKILL_TAGS)[number];

export const ARTICLE_SKILL_TAG_LABELS: Record<ArticleSkillTag, string> = {
  SKIMMING: "Skimming",
  SCANNING: "Scanning",
  MATCHING_HEADINGS: "Matching Headings",
  TRUE_FALSE_NOT_GIVEN: "True / False / Not Given",
  SUMMARY_COMPLETION: "Summary Completion",
  VOCABULARY_BUILDING: "Vocabulary Building",
};

export function parseArticleSkillTags(value: unknown): ArticleSkillTag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is ArticleSkillTag => typeof v === "string" && (ARTICLE_SKILL_TAGS as readonly string[]).includes(v));
}
