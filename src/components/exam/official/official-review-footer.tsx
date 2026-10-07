"use client";

import { memo, useEffect, useRef } from "react";

import type { PassageGroup } from "@/lib/exam/passage-groups";
import type { ReviewOutcome } from "@/lib/exam/official-review";
import { partLabelOf } from "@/components/exam/official/official-footer";

/** One question number in the review's footer: its stored outcome, and whether the filters currently show it. */
export type ReviewFooterNumber = { number: number; questionId: string; outcome: ReviewOutcome; dimmed: boolean };
export type ReviewFooterPart = { group: PassageGroup; numbers: ReviewFooterNumber[]; correct: number };

const OUTCOME_WORD: Record<ReviewOutcome, string> = { correct: "correct", wrong: "wrong", skipped: "not answered" };

const NumberButton = memo(function NumberButton({ item, current, onSelect }: { item: ReviewFooterNumber; current: boolean; onSelect: (item: ReviewFooterNumber) => void }) {
  return (
    <button
      type="button"
      className="ex-qbtn"
      onClick={() => onSelect(item)}
      aria-current={current ? "true" : undefined}
      aria-label={`Question ${item.number}, ${OUTCOME_WORD[item.outcome]}${current ? ", current question" : ""}`}
      data-result={item.outcome}
      data-dim={item.dimmed ? "true" : undefined}
      data-testid={`review-number-${item.number}`}
    >
      {item.number}
    </button>
  );
});

/**
 * The bar along the bottom of the review: the same bar as in the test (the part you are in is open with all its numbers, the others are closed to
 * "Part 2  11 of 13"), but every number is green when it was right and red when it was wrong or left empty, each with a tick or a cross. The arrows move
 * to the previous / next question.
 */
export const OfficialReviewFooter = memo(function OfficialReviewFooter({
  parts,
  openGroupKey,
  activeNumber,
  onSelectNumber,
  onSelectPart,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  parts: ReviewFooterPart[];
  openGroupKey: string;
  activeNumber: number;
  onSelectNumber: (item: ReviewFooterNumber) => void;
  onSelectPart: (group: PassageGroup) => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeNumber, openGroupKey]);

  return (
    <nav className="ex-footer" aria-label="Part and question navigation" data-testid="review-footer">
      <div className="ex-parts" ref={stripRef}>
        {parts.map(({ group, numbers, correct }) => {
          const label = partLabelOf(group);
          if (group.key === openGroupKey) {
            return (
              <div key={group.key} className="ex-part" role="group" aria-label={`${label}, questions ${group.firstNumber} to ${group.lastNumber}`}>
                <span className="ex-part-label">{label}</span>
                {numbers.map((item) => (
                  <NumberButton key={item.number} item={item} current={item.number === activeNumber} onSelect={onSelectNumber} />
                ))}
              </div>
            );
          }
          return (
            <button key={group.key} type="button" className="ex-part-button" onClick={() => onSelectPart(group)} aria-label={`Go to ${label}, ${correct} of ${group.total} correct`} data-testid={`review-part-${group.index + 1}`}>
              <strong>{label}</strong>{" "}
              <span className="ex-part-count" data-review="true">
                {correct} of {group.total}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ex-footer-end">
        <button type="button" className="ex-icon-button" aria-label="Previous question" disabled={!hasPrevious} onClick={onPrevious}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <button type="button" className="ex-icon-button" aria-label="Next question" disabled={!hasNext} onClick={onNext}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </nav>
  );
});
