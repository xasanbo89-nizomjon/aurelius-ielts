import type {
  ArticleDifficulty,
  SkillType,
  SubscriptionStatus,
  VocabularyStatus,
  WritingTaskCategory,
  WritingTaskNumber,
  WritingTaskStatus,
} from "@prisma/client";
import type { GrammarIssueCategory } from "@/lib/ai/prompts/writing-analysis";
import { Headphones, BookOpen, PenLine, Mic, type LucideIcon } from "lucide-react";

export const SKILL_LABELS: Record<SkillType, string> = {
  LISTENING: "Listening",
  READING: "Reading",
  WRITING: "Writing",
  SPEAKING: "Speaking",
};

export const SKILL_ICONS: Record<SkillType, LucideIcon> = {
  LISTENING: Headphones,
  READING: BookOpen,
  WRITING: PenLine,
  SPEAKING: Mic,
};

export const ARTICLE_DIFFICULTY_LABELS: Record<ArticleDifficulty, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

/**
 * Phase 19 — Vocabulary Analytics & Automatic Word Tracking. Display
 * wording only — the underlying enum stays UNKNOWN/LEARNING/KNOWN (no
 * schema/migration change, so existing saved statuses are unaffected):
 * RED (UNKNOWN) = Unknown / needs revision, YELLOW (LEARNING) = Partially
 * known, GREEN (KNOWN) = Viewed — the automatic default the moment a word
 * is clicked in an Article (see ArticleReader/saveWordAction), which a
 * student can then manually move to yellow or red.
 */
export const VOCABULARY_STATUS_LABELS: Record<VocabularyStatus, string> = {
  UNKNOWN: "Unknown",
  LEARNING: "Partially Known",
  KNOWN: "Viewed",
};

export const VOCABULARY_STATUS_EMOJI: Record<VocabularyStatus, string> = {
  UNKNOWN: "🔴",
  LEARNING: "🟡",
  KNOWN: "🟢",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIAL: "Free Trial",
  ACTIVE: "Premium",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

export const SUBSCRIPTION_STATUS_VARIANTS: Record<SubscriptionStatus, "accent" | "success" | "destructive" | "outline"> = {
  TRIAL: "accent",
  ACTIVE: "success",
  EXPIRED: "destructive",
  CANCELLED: "outline",
};

export const WRITING_TASK_NUMBER_LABELS: Record<WritingTaskNumber, string> = {
  TASK_1: "Task 1",
  TASK_2: "Task 2",
};

export const WRITING_TASK_CATEGORY_LABELS: Record<WritingTaskCategory, string> = {
  GRAPH: "Graph",
  TABLE: "Table",
  PROCESS: "Process",
  MAP: "Map",
  OPINION: "Opinion Essay",
  DISCUSSION: "Discussion Essay",
  PROBLEM_SOLUTION: "Problem/Solution",
  ADVANTAGES_DISADVANTAGES: "Advantages/Disadvantages",
};

export const WRITING_TASK_STATUS_LABELS: Record<WritingTaskStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const WRITING_TASK_STATUS_VARIANTS: Record<WritingTaskStatus, "accent" | "success" | "outline" | "secondary"> = {
  DRAFT: "outline",
  PUBLISHED: "success",
  ARCHIVED: "secondary",
};

export const GRAMMAR_ISSUE_CATEGORY_LABELS: Record<GrammarIssueCategory, string> = {
  GRAMMAR: "Grammar",
  WORD_FORM: "Word Form",
  TENSE: "Tense",
  ARTICLE: "Article",
  PREPOSITION: "Preposition",
  SPELLING: "Spelling",
  LINKING_WORD: "Linking Word",
  INFORMAL_LANGUAGE: "Informal Language",
};

/** Red / yellow / green — the traffic-light scheme from the Phase 19 brief. */
export const VOCABULARY_STATUS_COLORS: Record<VocabularyStatus, { dot: string; bg: string; text: string; border: string }> = {
  UNKNOWN: { dot: "bg-red-500", bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/25" },
  LEARNING: {
    dot: "bg-amber-500",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/25",
  },
  KNOWN: {
    dot: "bg-green-500",
    bg: "bg-green-500/10",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-500/25",
  },
};
