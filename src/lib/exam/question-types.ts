import { z } from "zod";
import type { QuestionType } from "@prisma/client";

/**
 * Single source of truth for what each IELTS question type looks like: the
 * shape a teacher configures (`options` / `correctAnswer` on Question) and
 * the shape a student submits (`response` on Answer). Both are stored as
 * Prisma `Json`, so these schemas are the only thing keeping them honest.
 *
 * To add a new question type: add it to the QuestionType enum in
 * schema.prisma, then add one entry below plus a renderer in
 * `src/components/exam/question-types/`. Nothing else needs to change.
 */

const choiceSchema = z.object({
  id: z.string().min(1, "Every choice needs an id."),
  text: z.string().min(1, "Every choice needs text."),
});

export const multipleChoiceOptionsSchema = z.object({
  choices: z.array(choiceSchema).min(2, "Add at least 2 answer choices."),
  allowMultiple: z.boolean().default(false),
});
export const multipleChoiceAnswerSchema = z.array(z.string()).min(1, "Select at least one correct answer.");

export const trueFalseNotGivenOptionsSchema = z.object({});
export const trueFalseNotGivenAnswerSchema = z.enum(["TRUE", "FALSE", "NOT_GIVEN"]);

export const matchingOptionsSchema = z.object({
  prompts: z.array(choiceSchema).min(1, "Add at least one item to match."),
  options: z.array(choiceSchema).min(2, "Add at least 2 matching options."),
});
export const matchingAnswerSchema = z.record(z.string(), z.string());

export const sentenceCompletionOptionsSchema = z.object({
  maxWords: z.number().int().positive().optional(),
  /// Optional drag-and-drop word bank — when set, the student can drag a
  /// word into the blank instead of (or in addition to) typing it.
  wordBank: z.array(z.string()).optional(),
});
export const sentenceCompletionAnswerSchema = z.string();

export const summaryCompletionOptionsSchema = z.object({
  text: z.string().min(1, "Add the summary text, with numbered blanks."),
  blankCount: z.number().int().positive("Set how many blanks the summary has."),
  wordBank: z.array(z.string()).optional(),
  maxWords: z.number().int().positive().optional(),
});
export const summaryCompletionAnswerSchema = z.record(z.string(), z.string());

export const fillInBlankOptionsSchema = z.object({
  maxWords: z.number().int().positive().optional(),
  /// Optional drag-and-drop word bank — same as sentenceCompletion's. Also
  /// what a "table completion" / "diagram labeling" question uses: the
  /// prompt text describes the table/diagram cell, and this is its blank.
  wordBank: z.array(z.string()).optional(),
});
export const fillInBlankAnswerSchema = z.string();

export const shortAnswerOptionsSchema = z.object({
  maxWords: z.number().int().positive().optional(),
});
export const shortAnswerAnswerSchema = z.string();

export const acceptableAnswerSchema = z.union([
  z.string(),
  z.array(z.string()).min(1, "Add at least one acceptable answer."),
]);
export const summaryCorrectAnswerSchema = z.record(z.string(), acceptableAnswerSchema);
export const matchingCorrectAnswerSchema = z.record(z.string(), z.string());

type QuestionTypeMeta = {
  label: string;
  description: string;
  supportsPassage: boolean;
  optionsSchema: z.ZodType;
  responseSchema: z.ZodType;
};

export const QUESTION_TYPE_META: Record<QuestionType, QuestionTypeMeta> = {
  MULTIPLE_CHOICE: {
    label: "Multiple Choice",
    description: "Choose one (or more) correct options.",
    supportsPassage: true,
    optionsSchema: multipleChoiceOptionsSchema,
    responseSchema: multipleChoiceAnswerSchema,
  },
  TRUE_FALSE_NOT_GIVEN: {
    label: "True / False / Not Given",
    description: "Decide whether a statement agrees with the passage.",
    supportsPassage: true,
    optionsSchema: trueFalseNotGivenOptionsSchema,
    responseSchema: trueFalseNotGivenAnswerSchema,
  },
  MATCHING: {
    label: "Matching Headings",
    description: "Match each item (e.g. a paragraph) to the correct option (e.g. a heading).",
    supportsPassage: true,
    optionsSchema: matchingOptionsSchema,
    responseSchema: matchingAnswerSchema,
  },
  SENTENCE_COMPLETION: {
    label: "Sentence Completion",
    description: "Complete a sentence with words from the passage.",
    supportsPassage: true,
    optionsSchema: sentenceCompletionOptionsSchema,
    responseSchema: sentenceCompletionAnswerSchema,
  },
  SUMMARY_COMPLETION: {
    label: "Summary Completion",
    description: "Fill in several numbered blanks within one connected summary.",
    supportsPassage: true,
    optionsSchema: summaryCompletionOptionsSchema,
    responseSchema: summaryCompletionAnswerSchema,
  },
  FILL_IN_BLANK: {
    label: "Fill in the Blank",
    description: "Complete a short gap with the correct word or phrase.",
    supportsPassage: true,
    optionsSchema: fillInBlankOptionsSchema,
    responseSchema: fillInBlankAnswerSchema,
  },
  SHORT_ANSWER: {
    label: "Short Answer",
    description: "Answer a question in a few words.",
    supportsPassage: true,
    optionsSchema: shortAnswerOptionsSchema,
    responseSchema: shortAnswerAnswerSchema,
  },
};

export const QUESTION_TYPE_ORDER: QuestionType[] = [
  "MULTIPLE_CHOICE",
  "TRUE_FALSE_NOT_GIVEN",
  "MATCHING",
  "SENTENCE_COMPLETION",
  "SUMMARY_COMPLETION",
  "FILL_IN_BLANK",
  "SHORT_ANSWER",
];

/** A blank starting point for the teacher's question editor when creating or switching type. */
export function defaultPayloadFor(type: QuestionType): { options: unknown; correctAnswer: unknown } {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return {
        options: {
          choices: [
            { id: "choice-a", text: "" },
            { id: "choice-b", text: "" },
          ],
          allowMultiple: false,
        },
        correctAnswer: [],
      };
    case "TRUE_FALSE_NOT_GIVEN":
      return { options: {}, correctAnswer: "" };
    case "MATCHING":
      return { options: { prompts: [], options: [] }, correctAnswer: {} };
    case "SUMMARY_COMPLETION":
      return { options: { text: "", blankCount: 0 }, correctAnswer: {} };
    case "SENTENCE_COMPLETION":
    case "FILL_IN_BLANK":
    case "SHORT_ANSWER":
      return { options: {}, correctAnswer: "" };
  }
}
