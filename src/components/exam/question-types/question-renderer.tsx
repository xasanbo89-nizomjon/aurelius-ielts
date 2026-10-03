"use client";

import type { QuestionType } from "@prisma/client";

import {
  multipleChoiceOptionsSchema,
  trueFalseNotGivenOptionsSchema,
  matchingOptionsSchema,
  sentenceCompletionOptionsSchema,
  summaryCompletionOptionsSchema,
  fillInBlankOptionsSchema,
  shortAnswerOptionsSchema,
} from "@/lib/exam/question-types";
import { MultipleChoiceAnswer } from "@/components/exam/question-types/multiple-choice";
import { TrueFalseNotGivenAnswer } from "@/components/exam/question-types/true-false";
import { MatchingAnswer } from "@/components/exam/question-types/matching";
import { TextAnswer } from "@/components/exam/question-types/text-answer";
import { SummaryCompletionAnswer } from "@/components/exam/question-types/summary-completion";

/**
 * Dispatches to the right answer widget for a question's type. This is the
 * one place that needs to change when a new QuestionType is added.
 */
type QuestionRendererProps = {
  questionId: string;
  type: QuestionType;
  options: unknown;
  value: unknown;
  onChange: (value: unknown) => void;
  /** First IELTS question number this row covers — matching / summary rows use it to number their individual items; every type uses it to label its answer control. */
  startNumber?: number;
  /** A summary row's answer keys, one per question number — so the boxes drawn are exactly the ones the navigator and grading count. */
  slotKeys?: readonly (string | null)[];
};

export function QuestionRenderer(props: QuestionRendererProps) {
  try {
    return renderByType(props);
  } catch {
    // A question whose stored options don't parse must not take the whole exam down with it.
    return (
      <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm">
        This question could not be displayed. Tell your teacher — your other answers are safe.
      </p>
    );
  }
}

function renderByType({ questionId, type, options, value, onChange, startNumber, slotKeys }: QuestionRendererProps) {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return (
        <MultipleChoiceAnswer
          questionId={questionId}
          options={multipleChoiceOptionsSchema.parse(options)}
          value={value as string[] | undefined}
          onChange={onChange}
          startNumber={startNumber}
        />
      );

    case "TRUE_FALSE_NOT_GIVEN":
      return (
        <TrueFalseNotGivenAnswer
          questionId={questionId}
          options={trueFalseNotGivenOptionsSchema.parse(options)}
          value={value as "TRUE" | "FALSE" | "NOT_GIVEN" | undefined}
          onChange={onChange}
          startNumber={startNumber}
        />
      );

    case "MATCHING":
      return (
        <MatchingAnswer
          questionId={questionId}
          options={matchingOptionsSchema.parse(options)}
          value={value as Record<string, string> | undefined}
          onChange={onChange}
          startNumber={startNumber}
        />
      );

    case "SUMMARY_COMPLETION":
      return (
        <SummaryCompletionAnswer
          questionId={questionId}
          options={summaryCompletionOptionsSchema.parse(options)}
          value={value as Record<string, string> | undefined}
          onChange={onChange}
          startNumber={startNumber}
          slotKeys={slotKeys}
        />
      );

    case "SENTENCE_COMPLETION":
      return (
        <TextAnswer
          questionId={questionId}
          options={sentenceCompletionOptionsSchema.parse(options)}
          value={value as string | undefined}
          onChange={onChange}
          startNumber={startNumber}
        />
      );

    case "FILL_IN_BLANK":
      return (
        <TextAnswer
          questionId={questionId}
          options={fillInBlankOptionsSchema.parse(options)}
          value={value as string | undefined}
          onChange={onChange}
          startNumber={startNumber}
        />
      );

    case "SHORT_ANSWER":
      return (
        <TextAnswer
          questionId={questionId}
          options={shortAnswerOptionsSchema.parse(options)}
          value={value as string | undefined}
          onChange={onChange}
          startNumber={startNumber}
        />
      );

    default:
      return <p className="text-muted-foreground text-sm">Unsupported question type.</p>;
  }
}
