import { z } from "zod";

import { applyLengthCap, lengthRule } from "@/lib/writing-assessment/length-rules";
import { taskBandFromCriteria, toCriterionBand, type Criteria } from "@/lib/writing-assessment/bands";
import { MAX_MISTAKES_PER_TASK, MAX_QUOTE_CHARS, MAX_VOCABULARY_PER_TASK, REPORT_VERSION, TASK_LABEL, type TaskKey } from "@/lib/writing-assessment/constants";

/**
 * Phase O - the report of one task, pure: what the model is asked to return (a zod schema and the matching JSON schema), how its reply is checked and turned into the
 * stored report, and how the stored report is read back. The model marks the four criteria and writes the feedback; every figure above that (the task band, the Writing
 * band) is worked out in bands.ts, the length penalty in length-rules.ts, and every quoted piece of the student's text is checked to really be in the essay.
 */

export const MISTAKE_CATEGORIES = ["GRAMMAR", "WORD_FORM", "TENSE", "ARTICLE", "PREPOSITION", "SPELLING", "PUNCTUATION", "LINKING_WORD", "WORD_CHOICE", "INFORMAL_LANGUAGE"] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

export const MISTAKE_LABEL: Record<MistakeCategory, string> = {
  GRAMMAR: "Grammar",
  WORD_FORM: "Word form",
  TENSE: "Tense",
  ARTICLE: "Article",
  PREPOSITION: "Preposition",
  SPELLING: "Spelling",
  PUNCTUATION: "Punctuation",
  LINKING_WORD: "Linking word",
  WORD_CHOICE: "Word choice",
  INFORMAL_LANGUAGE: "Informal language",
};

/** The criterion names, which differ only in the first one (Task 1: Task Achievement, Task 2: Task Response). */
export const CRITERION_KEYS = ["taskResponse", "coherence", "lexical", "grammar"] as const;
export type CriterionKey = (typeof CRITERION_KEYS)[number];

export function criterionLabel(key: CriterionKey, task: TaskKey): string {
  switch (key) {
    case "taskResponse":
      return task === "task1" ? "Task Achievement" : "Task Response";
    case "coherence":
      return "Coherence & Cohesion";
    case "lexical":
      return "Lexical Resource";
    case "grammar":
      return "Grammatical Range & Accuracy";
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// What the model returns
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const criterionReply = z.object({ band: z.number().min(0).max(9), comment: z.string().trim().min(1).max(1500) });

export const modelReplySchema = z.object({
  criteria: z.object({ taskResponse: criterionReply, coherence: criterionReply, lexical: criterionReply, grammar: criterionReply }),
  summary: z.string().trim().min(1).max(2000),
  strengths: z.array(z.string().trim().min(1).max(500)).max(8),
  improvements: z.array(z.string().trim().min(1).max(500)).max(8),
  mistakes: z.array(
    z.object({
      category: z.enum(MISTAKE_CATEGORIES),
      quote: z.string().trim().min(1).max(600),
      correction: z.string().trim().min(1).max(600),
      explanation: z.string().trim().min(1).max(600),
    })
  ).max(30),
  vocabulary: z.array(
    z.object({
      insteadOf: z.string().trim().min(1).max(120),
      better: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
      note: z.string().trim().max(400),
    })
  ).max(20),
  repeatedWords: z.array(z.string().trim().min(1).max(80)).max(12),
});
export type ModelReply = z.infer<typeof modelReplySchema>;

const stringSchema = (description: string) => ({ type: "string", description });
const criterionJson = (name: string) => ({
  type: "object",
  description: `${name}: the band (0-9, whole or half) and a 2-3 sentence comment that names what the response does and what holds it back, referring to this response only.`,
  properties: { band: { type: "number" }, comment: stringSchema("2-3 sentences, specific to this response.") },
  required: ["band", "comment"],
  additionalProperties: false,
});

/** The same shape for OpenAI structured outputs (strict: every field required, no extra fields). The ranges and lengths are checked by the zod schema above. */
export const MODEL_JSON_SCHEMA = {
  type: "object",
  properties: {
    criteria: {
      type: "object",
      properties: {
        taskResponse: criterionJson("Task Achievement (Task 1) / Task Response (Task 2)"),
        coherence: criterionJson("Coherence and Cohesion"),
        lexical: criterionJson("Lexical Resource"),
        grammar: criterionJson("Grammatical Range and Accuracy"),
      },
      required: ["taskResponse", "coherence", "lexical", "grammar"],
      additionalProperties: false,
    },
    summary: stringSchema("2-4 sentences: the overall impression of this response, and the single most important thing to change."),
    strengths: { type: "array", items: { type: "string" }, description: "Up to 5 genuine, specific strengths of THIS response. Empty when there is nothing specific to praise." },
    improvements: { type: "array", items: { type: "string" }, description: "The 3-5 most important things to improve, in order of effect on the band." },
    mistakes: {
      type: "array",
      description: "Up to 12 real mistakes, the most important first. Each `quote` MUST be copied letter for letter from the response (a phrase or one sentence), never paraphrased.",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...MISTAKE_CATEGORIES] },
          quote: stringSchema("The exact wrong words, copied from the response."),
          correction: stringSchema("The same words, corrected."),
          explanation: stringSchema("One short sentence: why it is wrong."),
        },
        required: ["category", "quote", "correction", "explanation"],
        additionalProperties: false,
      },
    },
    vocabulary: {
      type: "array",
      description: "Up to 6 weak, basic, imprecise or over-used words or phrases the student actually wrote, each with better alternatives.",
      items: {
        type: "object",
        properties: {
          insteadOf: stringSchema("The word or phrase from the response."),
          better: { type: "array", items: { type: "string" }, description: "2-4 stronger alternatives that fit the sentence." },
          note: stringSchema("One short sentence on when or how to use them. May be empty."),
        },
        required: ["insteadOf", "better", "note"],
        additionalProperties: false,
      },
    },
    repeatedWords: { type: "array", items: { type: "string" }, description: "Words or phrases the response overuses (up to 6). May be empty." },
  },
  required: ["criteria", "summary", "strengths", "improvements", "mistakes", "vocabulary", "repeatedWords"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The stored report
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type CriterionResult = { band: number; comment: string };

export type TaskReport = {
  task: TaskKey;
  submissionId: string;
  wordCount: number;
  minWords: number;
  /** Nothing was written: band 0, and no AI call was made. */
  noResponse: boolean;
  /** The mean of the four criteria, to the nearest half band. */
  band: number;
  criteria: Record<CriterionKey, CriterionResult>;
  /** Set when the response was too short and the Task Achievement / Response band was lowered to the cap (see length-rules.ts). */
  lengthCap: { from: number; to: number } | null;
  summary: string;
  strengths: string[];
  improvements: string[];
  mistakes: { category: MistakeCategory; quote: string; correction: string; explanation: string }[];
  vocabulary: { insteadOf: string; better: string[]; note: string }[];
  repeatedWords: string[];
  /** Task 1 only: whether the picture itself was shown to the model (false = it judged from the task's written description). */
  usedPicture: boolean | null;
};

export type StoredReport = { version: number; task1?: TaskReport; task2?: TaskReport };

export class ReplyProblem extends Error {}

/** Lower-cases, folds typographic quotes and dashes to plain ones and collapses every run of white space - so a quote matches the essay however the model typed it. */
export function foldText(text: string): string {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when `quote` really is a piece of `essay` (ignoring case, white space and typographic quotes). */
export function isInEssay(essay: string, quote: string): boolean {
  const piece = foldText(quote);
  return piece.length > 0 && foldText(essay).includes(piece);
}

export type FinishContext = { task: TaskKey; submissionId: string; essay: string; wordCount: number; usedPicture: boolean | null };

const unique = (items: string[]): string[] => [...new Set(items.map((item) => item.trim()).filter((item) => item.length > 0))];

/**
 * Turns a checked model reply into the stored report of the task: criterion bands on the half-band grid, the length penalty applied, the task band worked out,
 * quotes that are not in the essay dropped. A reply whose quotes are mostly invented is refused (ReplyProblem), so the caller asks the model once more.
 */
export function finishTask(reply: ModelReply, context: FinishContext): TaskReport {
  const minWords = context.task === "task1" ? 150 : 250;
  const rawBands = {
    taskResponse: toCriterionBand(reply.criteria.taskResponse.band),
    coherence: toCriterionBand(reply.criteria.coherence.band),
    lexical: toCriterionBand(reply.criteria.lexical.band),
    grammar: toCriterionBand(reply.criteria.grammar.band),
  };
  const capped = applyLengthCap(rawBands.taskResponse, context.wordCount, minWords);
  const bands: Criteria = { ...rawBands, taskResponse: capped.band };

  const wantedMistakes = reply.mistakes.filter((mistake) => foldText(mistake.quote) !== foldText(mistake.correction));
  const realMistakes = wantedMistakes.filter((mistake) => mistake.quote.length <= MAX_QUOTE_CHARS && isInEssay(context.essay, mistake.quote));
  // Three or more mistakes of which most were not found in the essay: the model was not reading this response.
  if (wantedMistakes.length >= 3 && realMistakes.length * 2 < wantedMistakes.length) {
    throw new ReplyProblem(`only ${realMistakes.length} of ${wantedMistakes.length} quoted mistakes are in the essay`);
  }

  const vocabulary = reply.vocabulary
    .filter((item) => isInEssay(context.essay, item.insteadOf))
    .map((item) => ({ insteadOf: item.insteadOf, better: unique(item.better).slice(0, 4), note: item.note }))
    .filter((item) => item.better.length > 0)
    .slice(0, MAX_VOCABULARY_PER_TASK);

  const criteria: Record<CriterionKey, CriterionResult> = {
    taskResponse: { band: bands.taskResponse, comment: reply.criteria.taskResponse.comment },
    coherence: { band: bands.coherence, comment: reply.criteria.coherence.comment },
    lexical: { band: bands.lexical, comment: reply.criteria.lexical.comment },
    grammar: { band: bands.grammar, comment: reply.criteria.grammar.comment },
  };
  if (capped.capped) {
    const rule = lengthRule(context.wordCount, minWords);
    criteria.taskResponse.comment = `${criteria.taskResponse.comment} The response has ${context.wordCount} words, under the ${minWords}-word minimum (${Math.round(rule.ratio * 100)}%), so this criterion is held at band ${capped.capped.to}.`;
  }

  return {
    task: context.task,
    submissionId: context.submissionId,
    wordCount: context.wordCount,
    minWords,
    noResponse: false,
    band: taskBandFromCriteria(bands),
    criteria,
    lengthCap: capped.capped,
    summary: reply.summary,
    strengths: unique(reply.strengths).slice(0, 5),
    improvements: unique(reply.improvements).slice(0, 5),
    mistakes: realMistakes.slice(0, MAX_MISTAKES_PER_TASK).map((mistake) => ({ category: mistake.category, quote: mistake.quote, correction: mistake.correction, explanation: mistake.explanation })),
    vocabulary,
    repeatedWords: unique(reply.repeatedWords).slice(0, 6),
    usedPicture: context.usedPicture,
  };
}

/** The report of a task with nothing written: band 0 in every criterion ("no response"), made without any AI call. */
export function noResponseReport(task: TaskKey, submissionId: string): TaskReport {
  const none: CriterionResult = { band: 0, comment: "No response was submitted for this task." };
  return {
    task,
    submissionId,
    wordCount: 0,
    minWords: task === "task1" ? 150 : 250,
    noResponse: true,
    band: 0,
    criteria: { taskResponse: { ...none }, coherence: { ...none }, lexical: { ...none }, grammar: { ...none } },
    lengthCap: null,
    summary: `No response was submitted for ${TASK_LABEL[task]}, so it is marked band 0.`,
    strengths: [],
    improvements: [],
    mistakes: [],
    vocabulary: [],
    repeatedWords: [],
    usedPicture: null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

function readCriterion(value: unknown): CriterionResult {
  const row = isObject(value) ? value : {};
  return { band: typeof row.band === "number" ? row.band : 0, comment: typeof row.comment === "string" ? row.comment : "" };
}

function readTask(value: unknown, task: TaskKey): TaskReport | undefined {
  if (!isObject(value)) return undefined;
  const criteria = isObject(value.criteria) ? value.criteria : {};
  const lengthCap = isObject(value.lengthCap) && typeof value.lengthCap.from === "number" && typeof value.lengthCap.to === "number" ? { from: value.lengthCap.from, to: value.lengthCap.to } : null;
  return {
    task,
    submissionId: typeof value.submissionId === "string" ? value.submissionId : "",
    wordCount: typeof value.wordCount === "number" ? value.wordCount : 0,
    minWords: typeof value.minWords === "number" ? value.minWords : task === "task1" ? 150 : 250,
    noResponse: value.noResponse === true,
    band: typeof value.band === "number" ? value.band : 0,
    criteria: { taskResponse: readCriterion(criteria.taskResponse), coherence: readCriterion(criteria.coherence), lexical: readCriterion(criteria.lexical), grammar: readCriterion(criteria.grammar) },
    lengthCap,
    summary: typeof value.summary === "string" ? value.summary : "",
    strengths: asStrings(value.strengths),
    improvements: asStrings(value.improvements),
    mistakes: Array.isArray(value.mistakes)
      ? value.mistakes.flatMap((item) =>
          isObject(item) && typeof item.quote === "string" && typeof item.correction === "string"
            ? [{ category: (MISTAKE_CATEGORIES as readonly string[]).includes(String(item.category)) ? (item.category as MistakeCategory) : "GRAMMAR", quote: item.quote, correction: item.correction, explanation: typeof item.explanation === "string" ? item.explanation : "" }]
            : []
        )
      : [],
    vocabulary: Array.isArray(value.vocabulary)
      ? value.vocabulary.flatMap((item) => (isObject(item) && typeof item.insteadOf === "string" ? [{ insteadOf: item.insteadOf, better: asStrings(item.better), note: typeof item.note === "string" ? item.note : "" }] : []))
      : [],
    repeatedWords: asStrings(value.repeatedWords),
    usedPicture: typeof value.usedPicture === "boolean" ? value.usedPicture : null,
  };
}

/** The stored report as the screens read it (the database holds plain JSON, so everything is checked on the way out). Null when there is nothing usable. */
export function readStoredReport(value: unknown): StoredReport | null {
  if (!isObject(value)) return null;
  const task1 = readTask(value.task1, "task1");
  const task2 = readTask(value.task2, "task2");
  if (!task1 && !task2) return null;
  return { version: typeof value.version === "number" ? value.version : REPORT_VERSION, ...(task1 ? { task1 } : {}), ...(task2 ? { task2 } : {}) };
}
