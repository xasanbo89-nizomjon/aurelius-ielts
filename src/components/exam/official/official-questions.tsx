"use client";

import { Fragment, memo, useMemo, useState, type ReactNode } from "react";

import {
  fillInBlankOptionsSchema,
  matchingOptionsSchema,
  multipleChoiceOptionsSchema,
  sentenceCompletionOptionsSchema,
  summaryCompletionOptionsSchema,
} from "@/lib/exam/question-types";
import { completeBlankIds, detectSummaryLayout, parseSummaryText, splitSummaryPart, type SummaryPart } from "@/lib/exam/summary-blanks";
import { buildGroupViews, findPromptBlank, isYesNoInstructions, matchingListLabel, promptRepeatsInstructions, type GroupView, type QuestionGroupInfo } from "@/lib/exam/question-groups";
import { formatNumberRange, type NumberedQuestion } from "@/lib/exam/question-numbering";
import { chooseCountOf } from "@/lib/exam/choose-many";
import type { ExamQuestion } from "@/components/exam/exam-runner";
import { OfficialQuestionText } from "@/components/exam/official/official-text";
import { OfficialBlank, OfficialDrop, OfficialWordBank, ignoreClickThatEndsASelection } from "@/components/exam/official/official-answer-controls";

export type OfficialRow = NumberedQuestion<ExamQuestion>;
type OnAnswer = (questionId: string, value: unknown) => void;
type RowProps = { row: OfficialRow; value: unknown; onAnswer: OnAnswer };

/** What a group of gap rows shares when the task has a word bank. */
type BankControls = { armed: string | null; place: (row: OfficialRow, word: string) => void };

const asText = (value: unknown) => (typeof value === "string" ? value : "");
const asRecord = (value: unknown): Record<string, string> => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, string>) : {});

/** "A" for a choice stored as "A"; otherwise its position. */
const choiceLetter = (id: string, index: number) => (/^[A-Za-z]$/.test(id) ? id.toUpperCase() : String.fromCharCode(65 + index));
/** Matching options keep the label they are printed with ("C", "iv"); an opaque id falls back to a letter. */
const optionLabel = (id: string, index: number) => (id.length <= 4 && /^[A-Za-z0-9]+$/.test(id) ? id : String.fromCharCode(65 + index));

/** One question row (or one grouped task such as "Questions 22–26"). The id and data attributes are what jumping to a question, and tracking where the student is, look for. */
function RowShell({ row, children }: { row: OfficialRow; children: ReactNode }) {
  return (
    <div id={`question-${row.id}`} className="ex-item" data-question-row="" data-question-id={row.id} data-start-number={row.startNumber} data-end-number={row.endNumber}>
      {children}
    </div>
  );
}

function Unavailable({ row }: { row: OfficialRow }) {
  return (
    <RowShell row={row}>
      <p className="ex-item-text">
        <span className="ex-number">{row.startNumber}</span>This question could not be displayed. Tell your teacher — your other answers are safe.
      </p>
    </RowShell>
  );
}

// ---------------------------------------------------------------------------
// Typed answers
// ---------------------------------------------------------------------------

/** Gap fill / sentence completion: the answer box sits where the sentence has its blank ("…respond to 1 ......."), else at the end of the sentence. */
const GapRow = memo(function GapRow({ row, value, onAnswer, bank }: RowProps & { bank: BankControls | null }) {
  const blank = useMemo(() => findPromptBlank(row.prompt, row.startNumber), [row.prompt, row.startNumber]);
  const input = (
    <OfficialBlank id={row.id} value={asText(value)} onValueChange={(next) => onAnswer(row.id, next)} number={row.startNumber} label={`Answer for question ${row.startNumber}`} />
  );
  const box = bank ? (
    <OfficialDrop armedWord={bank.armed} onPlace={(word) => bank.place(row, word)}>
      {input}
    </OfficialDrop>
  ) : (
    input
  );

  return (
    <RowShell row={row}>
      <OfficialQuestionText
        as="p"
        className="ex-item-text"
        questionId={row.id}
        part="prompt"
        text={row.prompt}
        hidden={blank ? [blank] : undefined}
        inserts={new Map<number, ReactNode>([[blank ? blank.start : row.prompt.length, box]])}
      />
    </RowShell>
  );
});

/** Short answer: the question, then the box underneath. */
const ShortAnswerRow = memo(function ShortAnswerRow({ row, value, onAnswer }: RowProps) {
  return (
    <RowShell row={row}>
      <p className="ex-item-text">
        <span className="ex-number">{row.startNumber}</span>
        <OfficialQuestionText questionId={row.id} part="prompt" text={row.prompt} />
      </p>
      <OfficialBlank id={row.id} value={asText(value)} onValueChange={(next) => onAnswer(row.id, next)} number={row.startNumber} label={`Answer for question ${row.startNumber}`} ownLine />
    </RowShell>
  );
});

// ---------------------------------------------------------------------------
// Choosing
// ---------------------------------------------------------------------------

const TRUE_FALSE = [
  { value: "TRUE", label: "TRUE" },
  { value: "FALSE", label: "FALSE" },
  { value: "NOT_GIVEN", label: "NOT GIVEN" },
] as const;
const YES_NO = [
  { value: "TRUE", label: "YES" },
  { value: "FALSE", label: "NO" },
  { value: "NOT_GIVEN", label: "NOT GIVEN" },
] as const;

/** True / False / Not Given — or Yes / No / Not Given when the task says so. The stored answer is TRUE / FALSE / NOT_GIVEN either way. */
const TrueFalseRow = memo(function TrueFalseRow({ row, value, onAnswer, yesNo }: RowProps & { yesNo: boolean }) {
  const choices = yesNo ? YES_NO : TRUE_FALSE;
  return (
    <RowShell row={row}>
      <p className="ex-item-text">
        <span className="ex-number">{row.startNumber}</span>
        <OfficialQuestionText questionId={row.id} part="prompt" text={row.prompt} />
      </p>
      <ul className="ex-options" role="radiogroup" aria-label={`Answer for question ${row.startNumber}`}>
        {choices.map((choice, index) => {
          const id = `${row.id}-${choice.value}`;
          return (
            <li key={choice.value}>
              <label htmlFor={id} className="ex-option">
                <input id={id} type="radio" name={row.id} value={choice.value} checked={value === choice.value} onChange={() => onAnswer(row.id, choice.value)} data-question-number={index === 0 ? row.startNumber : undefined} />
                <span className="ex-option-caps">{choice.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </RowShell>
  );
});

/** Multiple choice: one answer is a radio list, "Choose TWO" style tasks are checkboxes. The stored answer is the list of chosen choice ids. */
const ChoiceRow = memo(function ChoiceRow({ row, value, onAnswer, choices, allowMultiple, chooseCount }: RowProps & { choices: { id: string; text: string }[]; allowMultiple: boolean; chooseCount: number }) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  // "Choose TWO" covers two numbers (21-22): both are shown, and no more letters than that can be picked (a further box stays off until one is unticked).
  const limit = allowMultiple && chooseCount > 1 ? chooseCount : null;
  return (
    <RowShell row={row}>
      <p className="ex-item-text">
        <span className="ex-number">{formatNumberRange(row.startNumber, row.endNumber)}</span>
        <OfficialQuestionText questionId={row.id} part="prompt" text={row.prompt} />
      </p>
      <ul className="ex-options" role={allowMultiple ? "group" : "radiogroup"} aria-label={limit ? `Answer for questions ${row.startNumber} to ${row.endNumber}` : `Answer for question ${row.startNumber}`} data-choose-count={limit ?? undefined}>
        {choices.map((choice, index) => {
          const id = `${row.id}-${choice.id}`;
          const checked = selected.includes(choice.id);
          return (
            <li key={choice.id}>
              <label htmlFor={id} className="ex-option" onClickCapture={ignoreClickThatEndsASelection}>
                <input
                  id={id}
                  type={allowMultiple ? "checkbox" : "radio"}
                  name={row.id}
                  checked={checked}
                  disabled={limit !== null && !checked && selected.length >= limit}
                  onChange={() => onAnswer(row.id, allowMultiple ? (checked ? selected.filter((c) => c !== choice.id) : [...selected, choice.id]) : [choice.id])}
                  data-question-number={index === 0 ? row.startNumber : undefined}
                />
                <span className="ex-option-letter">{choiceLetter(choice.id, index)}</span>
                <OfficialQuestionText questionId={row.id} part={`choice:${choice.id}`} text={choice.text} />
              </label>
            </li>
          );
        })}
      </ul>
    </RowShell>
  );
});

/**
 * Matching (headings, sentence endings, places…): the options are listed once, and each item takes
 * one of them — by DRAGGING an option onto the item, by clicking an option and then the item
 * (touch screens, which cannot drag), or with the item's own drop-down (keyboard / screen reader).
 * All three write the same answer: { item id → option id }.
 */
const MatchingRow = memo(function MatchingRow({ row, value, onAnswer, prompts, options, listLabel, showPrompt }: RowProps & { prompts: { id: string; text: string }[]; options: { id: string; text: string }[]; listLabel: string; showPrompt: boolean }) {
  const answers = asRecord(value);
  const [armed, setArmed] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const labelOf = (id: string) => optionLabel(id, Math.max(0, options.findIndex((option) => option.id === id)));

  const place = (promptId: string, optionId: string) => {
    onAnswer(row.id, { ...answers, [promptId]: optionId });
    setArmed(null);
  };
  const clear = (promptId: string) => {
    const next = { ...answers };
    delete next[promptId];
    onAnswer(row.id, next);
  };

  return (
    <RowShell row={row}>
      {showPrompt && <OfficialQuestionText as="p" className="ex-item-text" questionId={row.id} part="prompt" text={row.prompt} />}
      <div className="ex-list" role="group" aria-label={listLabel}>
        <p className="ex-list-title">{listLabel}</p>
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            draggable
            className="ex-list-item"
            aria-pressed={armed === option.id}
            title="Drag onto a question, or click it and then click the question"
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", option.id);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => setArmed(armed === option.id ? null : option.id)}
          >
            <strong>{optionLabel(option.id, index)}</strong>
            <span>{option.text}</span>
          </button>
        ))}
      </div>
      {prompts.map((prompt, index) => {
        const number = row.startNumber + index;
        const chosen = answers[prompt.id] ?? "";
        const chosenOption = options.find((option) => option.id === chosen);
        return (
          <div
            key={prompt.id}
            className="ex-match-row"
            data-over={over === prompt.id ? "true" : undefined}
            data-armed={armed ? "true" : undefined}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setOver(prompt.id);
            }}
            onDragLeave={() => setOver((current) => (current === prompt.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setOver(null);
              const optionId = event.dataTransfer.getData("text/plain");
              if (options.some((option) => option.id === optionId)) place(prompt.id, optionId);
            }}
            onClick={(event) => {
              if (armed && !(event.target as HTMLElement).closest("button, select")) place(prompt.id, armed);
            }}
          >
            <span className="ex-number">{number}</span>
            <OfficialQuestionText questionId={row.id} part={`item:${prompt.id}`} text={prompt.text} />
            <select
              id={`${row.id}-${prompt.id}`}
              className="ex-select"
              data-empty={chosen ? undefined : "true"}
              value={chosen}
              onChange={(event) => place(prompt.id, event.target.value)}
              // While an option is picked up, clicking the box puts it there instead of opening the list.
              onMouseDown={(event) => {
                if (armed) {
                  event.preventDefault();
                  place(prompt.id, armed);
                }
              }}
              aria-label={`Question ${number}: match for ${prompt.text}`}
              data-question-number={number}
            >
              <option value="" hidden>
                {number}
              </option>
              {options.map((option, optionIndex) => (
                <option key={option.id} value={option.id}>
                  {optionLabel(option.id, optionIndex)}
                </option>
              ))}
            </select>
            {chosenOption && (
              <>
                <span className="ex-chosen">{chosenOption.text}</span>
                <button type="button" className="ex-clear" onClick={() => clear(prompt.id)} aria-label={`Clear the answer to question ${number} (${labelOf(chosenOption.id)})`}>
                  ×
                </button>
              </>
            )}
          </div>
        );
      })}
    </RowShell>
  );
});

// ---------------------------------------------------------------------------
// Summary / notes / table / flow-chart completion
// ---------------------------------------------------------------------------

/**
 * One text whose blanks are answer boxes — drawn as a paragraph, a table or a flow chart, whatever
 * the text looks like (see lib/exam/summary-blanks). EVERY number the row covers gets exactly one
 * box: blanks the text marks are drawn in place, any number without a blank in the text is listed
 * under "Answers for the remaining questions" instead of silently disappearing.
 */
const SummaryRow = memo(function SummaryRow({
  row,
  value,
  onAnswer,
  options,
  showPrompt,
}: RowProps & { options: { text: string; blankCount: number; wordBank?: string[]; layout?: "table" }; showPrompt: boolean }) {
  const answers = asRecord(value);
  const [armed, setArmed] = useState<string | null>(null);

  const parsed = useMemo(() => parseSummaryText(options.text), [options.text]);
  const layout = useMemo(() => detectSummaryLayout(options.text, options.layout), [options.text, options.layout]);
  const blankIds = useMemo(() => {
    const resolved = row.slotKeys.filter((key): key is string => key != null);
    if (resolved.length === row.slotKeys.length && resolved.length > 0) return resolved;
    return completeBlankIds(parsed.blankIds, options.blankCount, row.startNumber, null);
  }, [row.slotKeys, row.startNumber, parsed.blankIds, options.blankCount]);

  const inText = new Set(parsed.blankIds);
  const numberOf = (blankId: string): number => row.startNumber + Math.max(0, blankIds.indexOf(blankId));
  const setAnswer = (blankId: string, word: string) => onAnswer(row.id, { ...answers, [blankId]: word });

  function renderBlank(blankId: string, key: string) {
    const number = numberOf(blankId);
    const input = (
      <OfficialBlank id={`${row.id}-blank-${blankId}`} value={answers[blankId] ?? ""} onValueChange={(next) => setAnswer(blankId, next)} number={number} label={`Question ${number}`} />
    );
    return options.wordBank?.length ? (
      <OfficialDrop
        key={key}
        armedWord={armed}
        onPlace={(word) => {
          setAnswer(blankId, word);
          setArmed(null);
        }}
      >
        {input}
      </OfficialDrop>
    ) : (
      <Fragment key={key}>{input}</Fragment>
    );
  }

  // The n-th stretch of plain text keeps the name "text:n" however the layout wraps it, so a highlight stays attached to the same words.
  let textIndex = 0;
  function renderParts(parts: SummaryPart[], keyPrefix: string): ReactNode {
    return parts.map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (typeof part === "string") return <OfficialQuestionText key={key} questionId={row.id} part={`text:${textIndex++}`} text={part} />;
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
      <div style={{ overflowX: "auto" }}>
        <table className="ex-table" data-testid="summary-table">
          {layout.caption && <caption>{layout.caption}</caption>}
          {headerIsPlain && (
            <thead>
              <tr>
                {first.map((cell, c) => (
                  <th key={c}>{renderParts(partsOf(cell), `h${c}`)}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {bodyRows.map((cells, r) => (
              <tr key={r}>
                {layout.spanRows?.[headerIsPlain ? r + 1 : r] ? (
                  <td colSpan={layout.columns ?? cells.length} style={{ fontWeight: 600 }}>
                    {renderParts(partsOf(cells[0] ?? ""), `r${r}c0`)}
                  </td>
                ) : (
                  cells.map((cell, c) => <td key={c}>{renderParts(partsOf(cell), `r${r}c${c}`)}</td>)
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {layout.note && <p className="ex-table-note">{layout.note}</p>}
      </div>
    );
  } else if (layout.kind === "flow") {
    body = (
      <div className="ex-flow">
        {layout.steps.map((step, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <div className="ex-flow-arrow" aria-hidden="true">
                ↓
              </div>
            )}
            <div className="ex-flow-step">{renderParts(partsOf(step), `s${index}`)}</div>
          </Fragment>
        ))}
      </div>
    );
  } else {
    body = <div className="ex-summary">{renderParts(parsed.parts, "p")}</div>;
  }

  const unplaced = blankIds.filter((id) => !inText.has(id));

  return (
    <RowShell row={row}>
      {showPrompt && <OfficialQuestionText as="p" className="ex-item-text" questionId={row.id} part="prompt" text={row.prompt} />}
      {options.wordBank && options.wordBank.length > 0 && <OfficialWordBank words={options.wordBank} armedWord={armed} onArm={setArmed} />}
      {body}
      {unplaced.length > 0 && (
        <div className="ex-remaining" data-testid="summary-remaining-answers">
          <p>{inText.size === 0 ? "Write your answers here" : "Answers for the remaining questions"}</p>
          {unplaced.map((blankId) => (
            <div key={blankId} className="ex-remaining-row">
              <span className="ex-number">{numberOf(blankId)}</span>
              {renderBlank(blankId, `extra-${blankId}`)}
            </div>
          ))}
        </div>
      )}
    </RowShell>
  );
});

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

type ParsedRow =
  | { kind: "gap" }
  | { kind: "short" }
  | { kind: "trueFalse" }
  | { kind: "choice"; choices: { id: string; text: string }[]; allowMultiple: boolean; chooseCount: number }
  | { kind: "matching"; prompts: { id: string; text: string }[]; options: { id: string; text: string }[] }
  | { kind: "summary"; options: { text: string; blankCount: number; wordBank?: string[]; layout?: "table" } }
  | { kind: "unavailable" };

/** A question whose stored options don't parse must not take the whole exam down with it: it becomes "could not be displayed" and the rest carries on. */
function parseRow(row: OfficialRow): ParsedRow {
  try {
    switch (row.type) {
      case "FILL_IN_BLANK":
      case "SENTENCE_COMPLETION":
        return { kind: "gap" };
      case "SHORT_ANSWER":
        return { kind: "short" };
      case "TRUE_FALSE_NOT_GIVEN":
        return { kind: "trueFalse" };
      case "MULTIPLE_CHOICE": {
        const options = multipleChoiceOptionsSchema.parse(row.options);
        return { kind: "choice", choices: options.choices, allowMultiple: options.allowMultiple, chooseCount: chooseCountOf("MULTIPLE_CHOICE", row.options) };
      }
      case "MATCHING": {
        const options = matchingOptionsSchema.parse(row.options);
        return { kind: "matching", prompts: options.prompts, options: options.options };
      }
      case "SUMMARY_COMPLETION":
        return { kind: "summary", options: summaryCompletionOptionsSchema.parse(row.options) };
      default:
        return { kind: "unavailable" };
    }
  } catch {
    return { kind: "unavailable" };
  }
}

/** Picks the widget for a row. Memoised on the row's own answer, so typing in one box re-renders that row and nothing else. */
const RowView = memo(function RowView({ row, value, onAnswer, instructions, yesNo, bank }: RowProps & { instructions: string | null; yesNo: boolean; bank: BankControls | null }) {
  const parsed = useMemo(() => parseRow(row), [row]);
  switch (parsed.kind) {
    case "gap":
      return <GapRow row={row} value={value} onAnswer={onAnswer} bank={bank} />;
    case "short":
      return <ShortAnswerRow row={row} value={value} onAnswer={onAnswer} />;
    case "trueFalse":
      return <TrueFalseRow row={row} value={value} onAnswer={onAnswer} yesNo={yesNo} />;
    case "choice":
      return <ChoiceRow row={row} value={value} onAnswer={onAnswer} choices={parsed.choices} allowMultiple={parsed.allowMultiple} chooseCount={parsed.chooseCount} />;
    case "matching":
      return (
        <MatchingRow
          row={row}
          value={value}
          onAnswer={onAnswer}
          prompts={parsed.prompts}
          options={parsed.options}
          listLabel={matchingListLabel(instructions, row.prompt)}
          showPrompt={!promptRepeatsInstructions(row.prompt, instructions)}
        />
      );
    case "summary":
      return <SummaryRow row={row} value={value} onAnswer={onAnswer} options={parsed.options} showPrompt={!promptRepeatsInstructions(row.prompt, instructions)} />;
    default:
      return <Unavailable row={row} />;
  }
});

function OfficialGroup({ view, answers, onAnswer }: { view: GroupView<OfficialRow>; answers: Record<string, unknown>; onAnswer: OnAnswer }) {
  const [armed, setArmed] = useState<string | null>(null);
  const yesNo = isYesNoInstructions(view.instructions);

  // A word bank is shared by the gap rows of a group (the task prints one box of words for all of them).
  const gapBank = useMemo(() => {
    const words: string[] = [];
    for (const row of view.rows) {
      if (row.type !== "FILL_IN_BLANK" && row.type !== "SENTENCE_COMPLETION") continue;
      const parsed = (row.type === "FILL_IN_BLANK" ? fillInBlankOptionsSchema : sentenceCompletionOptionsSchema).safeParse(row.options);
      for (const word of parsed.success ? (parsed.data.wordBank ?? []) : []) if (!words.includes(word)) words.push(word);
    }
    return words;
  }, [view.rows]);
  const hasBank = gapBank.length > 0;
  const bank = useMemo<BankControls | null>(
    () =>
      hasBank
        ? {
            armed,
            place: (row, word) => {
              onAnswer(row.id, word);
              setArmed(null);
            },
          }
        : null,
    [hasBank, armed, onAnswer]
  );

  return (
    <section className="ex-group" aria-label={view.label}>
      <h2 className="ex-group-title">{view.label}</h2>
      {view.instructions && <OfficialQuestionText as="p" className="ex-instructions" questionId={view.rows[0].id} part="instructions" text={view.instructions} />}
      {hasBank && <OfficialWordBank words={gapBank} armedWord={armed} onArm={setArmed} />}
      {view.rows.map((row) => (
        <RowView key={row.id} row={row} value={answers[row.id]} onAnswer={onAnswer} instructions={view.instructions} yesNo={yesNo} bank={bank} />
      ))}
    </section>
  );
}

/** The questions of one part, grouped under "Questions N–M" headings with their instructions. */
export function OfficialQuestionGroups({ rows, groups, answers, onAnswer }: { rows: readonly OfficialRow[]; groups: readonly QuestionGroupInfo[]; answers: Record<string, unknown>; onAnswer: OnAnswer }) {
  const views = useMemo(() => buildGroupViews(rows, groups), [rows, groups]);
  if (views.length === 0) return <p>No questions in this part.</p>;
  return (
    <>
      {views.map((view) => (
        <OfficialGroup key={view.key} view={view} answers={answers} onAnswer={onAnswer} />
      ))}
    </>
  );
}
