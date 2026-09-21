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
export function QuestionRenderer({
  questionId,
  type,
  options,
  value,
  onChange,
}: {
  questionId: string;
  type: QuestionType;
  options: unknown;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return (
        <MultipleChoiceAnswer
          questionId={questionId}
          options={multipleChoiceOptionsSchema.parse(options)}
          value={value as string[] | undefined}
          onChange={onChange}
        />
      );

    case "TRUE_FALSE_NOT_GIVEN":
      return (
        <TrueFalseNotGivenAnswer
          questionId={questionId}
          options={trueFalseNotGivenOptionsSchema.parse(options)}
          value={value as "TRUE" | "FALSE" | "NOT_GIVEN" | undefined}
          onChange={onChange}
        />
      );

    case "MATCHING":
      return (
        <MatchingAnswer
          questionId={questionId}
          options={matchingOptionsSchema.parse(options)}
          value={value as Record<string, string> | undefined}
          onChange={onChange}
        />
      );

    case "SUMMARY_COMPLETION":
      return (
        <SummaryCompletionAnswer
          questionId={questionId}
          options={summaryCompletionOptionsSchema.parse(options)}
          value={value as Record<string, string> | undefined}
          onChange={onChange}
        />
      );

    case "SENTENCE_COMPLETION":
      return (
        <TextAnswer
          questionId={questionId}
          options={sentenceCompletionOptionsSchema.parse(options)}
          value={value as string | undefined}
          onChange={onChange}
        />
      );

    case "FILL_IN_BLANK":
      return (
        <TextAnswer
          questionId={questionId}
          options={fillInBlankOptionsSchema.parse(options)}
          value={value as string | undefined}
          onChange={onChange}
        />
      );

    case "SHORT_ANSWER":
      return (
        <TextAnswer
          questionId={questionId}
          options={shortAnswerOptionsSchema.parse(options)}
          value={value as string | undefined}
          onChange={onChange}
        />
      );

    default:
      return <p className="text-muted-foreground text-sm">Unsupported question type.</p>;
  }
}
