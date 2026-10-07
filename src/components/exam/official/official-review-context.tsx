"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { ReviewNumber } from "@/lib/exam/official-review";

/**
 * Phase M2 - the review in the official exam layout draws the SAME question rows as the exam (official-questions.tsx), read-only. This context is how the
 * rows know they are in a review and what to show: the stored verdict of every number, the right answer, the explanation a teacher approved. Outside a
 * review the context is null and every row draws exactly what it always drew.
 */

/** An approved explanation, as a student may read it (see src/lib/exam/question-explanations.ts). Any part may be missing; a question with none shows no buttons. */
export type ReviewExplanation = { explain: string | null; trap: string | null; fix: string | null };

export type ReviewRowView = {
  numbers: ReviewNumber[];
  /** The student's saved answer and the stored right answer of the row, for drawing which option was picked / is right. */
  studentRaw: unknown;
  correctRaw: unknown;
  explanation: ReviewExplanation | null;
};

export type ReviewApi = {
  rows: ReadonlyMap<string, ReviewRowView>;
  /** The exam root: popovers are drawn inside it so they follow the contrast and text-size settings. */
  popoverRoot: HTMLElement | null;
  openPopover: string | null;
  setOpenPopover: (id: string | null) => void;
};

export const ReviewContext = createContext<ReviewApi | null>(null);

export const useReview = () => useContext(ReviewContext);

export function useReviewRow(rowId: string): ReviewRowView | null {
  return useContext(ReviewContext)?.rows.get(rowId) ?? null;
}

/** The result of one number of a row, or null outside a review. */
export function useReviewNumber(rowId: string, number: number): ReviewNumber | null {
  return useReviewRow(rowId)?.numbers.find((item) => item.number === number) ?? null;
}

/** The question number in front of a question: in a review it is a box coloured by the stored verdict (green right, red wrong or left empty). */
export function NumberBox({ rowId, number, children }: { rowId: string; number: number; children?: ReactNode }) {
  const result = useReviewNumber(rowId, number);
  return (
    <span className="ex-number" data-outcome={result?.outcome} data-number={result ? number : undefined}>
      {children ?? number}
    </span>
  );
}

const OUTCOME_LABEL = { correct: "Correct", wrong: "Wrong", skipped: "Not answered" } as const;

/** The tick or cross and "Answer: ..." after a question number (drawn right after its answer box, or under its options). */
export function ReviewMark({ result, extra }: { result: ReviewNumber; extra?: ReactNode }) {
  return (
    <span className="ex-rv" data-outcome={result.outcome} data-number={result.number} data-testid={`rv-${result.number}`}>
      <span className="ex-rv-icon" role="img" aria-label={OUTCOME_LABEL[result.outcome]}>
        {result.outcome === "correct" ? "✓" : "✗"}
      </span>
      <span className="ex-rv-answer" data-testid={`rv-answer-${result.number}`}>
        Answer: <strong>{result.correct || "—"}</strong>
      </span>
      {extra}
    </span>
  );
}

/** The mark of one number of a row; null outside a review. For a row of ONE number the explanation buttons sit next to it. */
export function RowNumberMark({ rowId, number }: { rowId: string; number: number }) {
  const row = useReviewRow(rowId);
  const result = row?.numbers.find((item) => item.number === number);
  if (!row || !result) return null;
  return <ReviewMark result={result} extra={row.numbers.length === 1 ? <ExplainButtons rowId={rowId} firstNumber={result.number} /> : null} />;
}

/** Under a row that covers several numbers (matching, summary, Choose TWO): its explanation buttons, once. */
export function RowExplainBar({ rowId }: { rowId: string }) {
  const row = useReviewRow(rowId);
  if (!row || row.numbers.length < 2 || !hasExplanation(row.explanation)) return null;
  const first = row.numbers[0].number;
  const last = row.numbers[row.numbers.length - 1].number;
  return (
    <div className="ex-rv-bar" data-testid={`rv-bar-${first}`}>
      <span className="ex-rv-bar-label">
        Questions {first}–{last}
      </span>
      <ExplainButtons rowId={rowId} firstNumber={first} />
    </div>
  );
}

const hasExplanation = (explanation: ReviewExplanation | null | undefined): explanation is ReviewExplanation =>
  !!explanation && (!!explanation.explain?.trim() || !!explanation.trap?.trim() || !!explanation.fix?.trim());

/** "Explain more" and "What's the trap?": a button for each part the question has an approved text for - none at all when it has none. */
export function ExplainButtons({ rowId, firstNumber }: { rowId: string; firstNumber: number }) {
  const row = useReviewRow(rowId);
  const explanation = row?.explanation;
  if (!hasExplanation(explanation)) return null;
  return (
    <span className="ex-rv-buttons">
      {explanation.explain?.trim() && <PopoverButton id={`${rowId}:explain`} testId={`explain-${firstNumber}`} label="Explain more" title="Explain more" body={<ExplainBody text={explanation.explain} />} />}
      {(explanation.trap?.trim() || explanation.fix?.trim()) && <PopoverButton id={`${rowId}:trap`} testId={`trap-${firstNumber}`} label="What's the trap?" title="What's the trap?" body={<TrapBody trap={explanation.trap} fix={explanation.fix} />} />}
    </span>
  );
}

function ExplainBody({ text }: { text: string }) {
  return <p className="ex-pop-text">{text}</p>;
}

function TrapBody({ trap, fix }: { trap: string | null; fix: string | null }) {
  return (
    <>
      {trap?.trim() && (
        <>
          <h4>The trap</h4>
          <p className="ex-pop-text">{trap}</p>
        </>
      )}
      {fix?.trim() && (
        <>
          <h4>The fix</h4>
          <p className="ex-pop-text">{fix}</p>
        </>
      )}
    </>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** A small button that opens a note-like popover under itself (one at a time); closes on Escape, a click elsewhere, or its own ×. */
function PopoverButton({ id, testId, label, title, body }: { id: string; testId: string; label: string; title: string; body: ReactNode }) {
  const review = useReview();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const open = review?.openPopover === id;
  const setOpenPopover = review?.setOpenPopover;

  const place = useCallback(() => {
    const button = buttonRef.current;
    const pop = popRef.current;
    if (!button || !pop) return;
    const rect = button.getBoundingClientRect();
    const { width, height } = pop.getBoundingClientRect();
    const margin = 8;
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - margin ? Math.max(margin, rect.top - 6 - height) : below;
    setAt({ left: clamp(rect.left, margin, window.innerWidth - margin - width), top });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open || !setOpenPopover) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpenPopover(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPopover(null);
        buttonRef.current?.focus();
      }
    };
    const onViewport = () => place();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewport);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewport);
    };
  }, [open, setOpenPopover, place]);

  useEffect(() => {
    if (!open) setAt(null);
  }, [open]);

  if (!review) return null;
  return (
    <>
      <button ref={buttonRef} type="button" className="ex-rv-button" aria-haspopup="dialog" aria-expanded={open} data-testid={testId} onClick={() => setOpenPopover?.(open ? null : id)}>
        {label}
      </button>
      {open &&
        review.popoverRoot &&
        createPortal(
          <div ref={popRef} className="ex-pop" role="dialog" aria-label={title} data-testid={`${testId}-popover`} style={at ? { left: at.left, top: at.top } : { left: 0, top: 0, visibility: "hidden" }}>
            <button type="button" className="ex-pop-close" aria-label="Close" onClick={() => setOpenPopover?.(null)}>
              ×
            </button>
            <p className="ex-pop-note">Auto-generated explanation — may not be fully accurate.</p>
            <h3 className="ex-pop-title">{title}</h3>
            {body}
          </div>,
          review.popoverRoot
        )}
    </>
  );
}
