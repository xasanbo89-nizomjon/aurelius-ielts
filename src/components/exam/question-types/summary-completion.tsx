"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { z } from "zod";

import type { summaryCompletionOptionsSchema } from "@/lib/exam/question-types";
import { completeBlankIds, detectSummaryLayout, parseSummaryText, splitSummaryPart, type SummaryPart } from "@/lib/exam/summary-blanks";
import { cn } from "@/lib/utils";
import { AnswerInput } from "@/components/exam/answer-input";
import { HlText } from "@/components/exam/highlight/question-highlight-context";
import { DraggableWordBank, DroppableBlank } from "@/components/exam/question-types/word-bank";
import type { QuestionAnswerProps } from "@/components/exam/question-types/types";

type Options = z.infer<typeof summaryCompletionOptionsSchema>;

/**
 * Summary, notes, table and flow-chart completion — all one question row whose
 * text carries the blanks (see lib/exam/summary-blanks). Whatever the layout,
 * EVERY number the row covers gets exactly one answer box: blanks the text
 * marks are drawn in place, and any number the text has no blank for is drawn
 * in a short "remaining answers" list instead of silently disappearing.
 */
export function SummaryCompletionAnswer({
  questionId,
  options,
  value,
  onChange,
  startNumber,
  slotKeys,
}: QuestionAnswerProps<Options, Record<string, string>> & {
  /** The row's answer keys, one per question number (what the navigator and grading use). Derived from the text when absent. */
  slotKeys?: readonly (string | null)[];
}) {
  const answers = value ?? {};
  const [armedWord, setArmedWord] = useState<string | null>(null);

  const parsed = useMemo(() => parseSummaryText(options.text), [options.text]);
  const layout = useMemo(() => detectSummaryLayout(options.text, options.layout), [options.text, options.layout]);
  const blankIds = useMemo(() => {
    const resolved = slotKeys?.filter((key): key is string => key != null);
    if (resolved && resolved.length === (slotKeys?.length ?? 0) && resolved.length > 0) return resolved;
    return completeBlankIds(parsed.blankIds, options.blankCount, startNumber, null);
  }, [slotKeys, parsed.blankIds, options.blankCount, startNumber]);

  const inText = new Set(parsed.blankIds);
  const numberOf = (blankId: string): number | null => (startNumber != null ? startNumber + Math.max(0, blankIds.indexOf(blankId)) : null);

  function setAnswer(blankId: string, word: string) {
    onChange({ ...answers, [blankId]: word });
  }

  function placeInBlank(blankId: string, word: string) {
    setAnswer(blankId, word);
    setArmedWord(null);
  }

  function renderBlank(blankId: string, key: string, wide = false) {
    const number = numberOf(blankId);
    return (
      <DroppableBlank key={key} onPlace={(word) => placeInBlank(blankId, word)} armedWord={armedWord}>
        <AnswerInput
          id={`${questionId}-blank-${blankId}`}
          value={answers[blankId] ?? ""}
          onValueChange={(next) => setAnswer(blankId, next)}
          placeholder={number != null ? String(number) : "…"}
          data-question-number={number ?? undefined}
          aria-label={number != null ? `Question ${number}` : `Blank ${blankId}`}
          className={cn("mx-1 inline-block h-8 px-2 align-baseline", wide ? "w-40" : "w-32")}
        />
      </DroppableBlank>
    );
  }

  // The n-th stretch of plain text keeps the name "text:n" however the layout wraps it, so a highlight stays attached to the same words.
  let textIndex = 0;
  function renderParts(parts: SummaryPart[], keyPrefix: string): ReactNode {
    return parts.map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (typeof part === "string") return <HlText key={key} questionId={questionId} part={`text:${textIndex++}`} text={part} />;
      return renderBlank(part.blank, key);
    });
  }
  const partsOf = (text: string) => splitSummaryPart(text, parsed.style);

  let body: ReactNode;
  if (layout.kind === "table") {
    const hasBlank = (cell: string) => partsOf(cell).some((part) => typeof part !== "string");
    const [first, ...rest] = layout.rows;
    const headerIsPlain = first.every((cell) => !hasBlank(cell));
    const bodyRows = headerIsPlain ? rest : layout.rows;
    body = (
      <div className="overflow-x-auto">
        <table className="border-border w-full min-w-[28rem] border-collapse text-[15px] leading-[2]" data-testid="summary-table">
          {layout.caption && <caption className="pb-1.5 text-left font-medium">{layout.caption}</caption>}
          {headerIsPlain && (
            <thead>
              <tr>
                {first.map((cell, c) => (
                  <th key={c} className="border-border bg-secondary/60 border px-3 py-1.5 text-left font-medium">
                    {renderParts(partsOf(cell), `h${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {bodyRows.map((row, r) => (
              <tr key={r}>
                {layout.spanRows?.[headerIsPlain ? r + 1 : r] ? (
                  <td colSpan={layout.columns ?? row.length} className="border-border border px-3 py-1.5 align-top font-medium">
                    {renderParts(partsOf(row[0] ?? ""), `r${r}c0`)}
                  </td>
                ) : (
                  row.map((cell, c) => (
                    <td key={c} className="border-border border px-3 py-1.5 align-top">
                      {renderParts(partsOf(cell), `r${r}c${c}`)}
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {layout.note && <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">{layout.note}</p>}
      </div>
    );
  } else if (layout.kind === "flow") {
    body = (
      <div className="mx-auto flex max-w-xl flex-col items-stretch">
        {layout.steps.map((step, index) => (
          <Fragment key={index}>
            {index > 0 && <ChevronDown className="text-muted-foreground mx-auto my-1 size-5" aria-hidden="true" />}
            <div className="border-border bg-card rounded-xl border px-4 py-3 text-center text-[15px] leading-[2]">{renderParts(partsOf(step), `s${index}`)}</div>
          </Fragment>
        ))}
      </div>
    );
  } else {
    body = <div className="font-display text-[15.5px] leading-[2] whitespace-pre-line">{renderParts(parsed.parts, "p")}</div>;
  }

  const unplaced = blankIds.filter((id) => !inText.has(id));

  return (
    <div className="space-y-4">
      {body}

      {unplaced.length > 0 && (
        <div className="border-border/70 bg-secondary/30 space-y-2 rounded-xl border px-4 py-3" data-testid="summary-remaining-answers">
          <p className="text-muted-foreground text-xs font-medium">
            {inText.size === 0 ? "Write your answers here" : "Answers for the remaining questions"}
          </p>
          {unplaced.map((blankId) => {
            const number = numberOf(blankId);
            return (
              <div key={blankId} className="flex items-center gap-3 text-sm">
                {number != null && <span className="bg-secondary text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums">{number}</span>}
                {renderBlank(blankId, `extra-${blankId}`, true)}
              </div>
            );
          })}
        </div>
      )}

      {options.wordBank && options.wordBank.length > 0 && (
        <DraggableWordBank words={options.wordBank} armedWord={armedWord} onArm={setArmedWord} />
      )}

      {options.maxWords && (
        <p className="text-muted-foreground text-xs">
          No more than {options.maxWords} word{options.maxWords === 1 ? "" : "s"} per blank.
        </p>
      )}
    </div>
  );
}
