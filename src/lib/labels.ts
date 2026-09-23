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
 * Display wording only — the underlying enum stays UNKNOWN/LEARNING/KNOWN
 * (no schema/migration change, so existing saved statuses are unaffected):
 * RED (UNKNOWN) = Hard, YELLOW (LEARNING) = Medium, BLUE (KNOWN) = Easy.
 * Every word clicked in an Article is auto-saved (see ArticleReader) —
 * defaulting to Medium/yellow when the student never explicitly chooses a
 * color, per the Phase 19 brief. A student can still move it to Hard or
 * Easy at any time.
 */
export const VOCABULARY_STATUS_LABELS: Record<VocabularyStatus, string> = {
  UNKNOWN: "Hard",
  LEARNING: "Medium",
  KNOWN: "Easy",
};

export const VOCABULARY_STATUS_EMOJI: Record<VocabularyStatus, string> = {
  UNKNOWN: "🔴",
  LEARNING: "🟡",
  KNOWN: "🔵",
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

/** Red / yellow / blue — the traffic-light scheme from the Phase 19 brief (Hard / Medium / Easy). */
export const VOCABULARY_STATUS_COLORS: Record<VocabularyStatus, { dot: string; bg: string; text: string; border: string }> = {
  UNKNOWN: { dot: "bg-red-500", bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-500/25" },
  LEARNING: {
    dot: "bg-amber-500",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/25",
  },
  KNOWN: { dot: "bg-blue-500", bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/25" },
};
