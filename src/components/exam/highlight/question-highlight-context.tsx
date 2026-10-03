"use client";

import { createContext, useContext, type ElementType } from "react";

import { questionRegion, type HighlightRange } from "@/lib/exam/text-highlight";
import { HighlightableText } from "@/components/exam/highlight/highlightable-text";

const EMPTY: readonly HighlightRange[] = [];

/** region → highlight ranges, provided by the exam runner to everything inside the question panel. */
const QuestionHighlightContext = createContext<ReadonlyMap<string, readonly HighlightRange[]> | null>(null);
export const QuestionHighlightProvider = QuestionHighlightContext.Provider;

/**
 * A piece of a question's text that can be highlighted — its wording, an answer
 * option, a sentence of a summary. `part` names the string within the question
 * ("prompt", "choice:<id>", "text:<n>", "item:<id>"); it is part of how the
 * highlight is stored, so it must be stable for a given piece of text.
 *
 * Outside an exam (no provider) it simply renders the text.
 */
export function HlText({
  questionId,
  part,
  text,
  as,
  className,
}: {
  questionId: string;
  part: string;
  text: string;
  as?: ElementType;
  className?: string;
}) {
  const ranges = useContext(QuestionHighlightContext);
  const region = questionRegion(questionId, part);
  return <HighlightableText region={region} text={text} highlights={ranges?.get(region) ?? EMPTY} as={as} className={className} />;
}
