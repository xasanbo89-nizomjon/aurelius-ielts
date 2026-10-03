"use client";

import { memo, useEffect, useRef } from "react";

import type { NavNumber, PassageGroup } from "@/lib/exam/passage-groups";

/** The passage groups are labelled "Passage 2" for the legacy screen; the official screen calls them parts. */
export const partLabelOf = (group: PassageGroup) => group.label.replace(/^Passage\b/, "Part");

const NumberButton = memo(function NumberButton({ item, current, onSelect }: { item: NavNumber; current: boolean; onSelect: (item: NavNumber) => void }) {
  return (
    <button
      type="button"
      className="ex-qbtn"
      onClick={() => onSelect(item)}
      aria-current={current ? "true" : undefined}
      aria-label={`Question ${item.number}${item.answered ? ", answered" : ", not answered"}${item.flagged ? ", flagged for review" : ""}${current ? ", current question" : ""}`}
      data-state={item.answered ? "answered" : "unanswered"}
      data-flagged={item.flagged ? "true" : undefined}
    >
      {item.number}
    </button>
  );
});

/**
 * The bar along the bottom:
 *
 *   Part 1  1 2 3 4 5 6 7 8 9 10 11 12 13     Part 2  0 of 13     Part 3  0 of 14      ☐ Review  ←  →  ✓
 *
 * The part you are in is open with all its numbers (current = boxed, answered = filled, flagged =
 * a small corner mark); the others are closed to "Part 2  0 of 13" and open when clicked. The
 * checkbox flags the current question for review; ✓ asks to finish the test.
 */
export const OfficialFooter = memo(function OfficialFooter({
  groups,
  activeNumber,
  openGroupKey,
  reviewChecked,
  onToggleReview,
  onSelectNumber,
  onSelectGroup,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onFinish,
}: {
  groups: PassageGroup[];
  activeNumber: number;
  openGroupKey: string;
  reviewChecked: boolean;
  onToggleReview: () => void;
  onSelectNumber: (item: NavNumber) => void;
  onSelectGroup: (group: PassageGroup) => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onFinish: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  // On a narrow screen the open part scrolls sideways; keep the current number in view.
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeNumber, openGroupKey]);

  return (
    <nav className="ex-footer" aria-label="Passage and question navigation">
      <div className="ex-parts" ref={stripRef}>
        {groups.map((group) => {
          const label = partLabelOf(group);
          if (group.key === openGroupKey) {
            return (
              <div key={group.key} className="ex-part" role="group" aria-label={`${label}, questions ${group.firstNumber} to ${group.lastNumber}`}>
                <span className="ex-part-label">{label}</span>
                {group.numbers.map((item) => (
                  <NumberButton key={item.number} item={item} current={item.number === activeNumber} onSelect={onSelectNumber} />
                ))}
              </div>
            );
          }
          return (
            <button key={group.key} type="button" className="ex-part-button" onClick={() => onSelectGroup(group)} aria-label={`Go to ${label}, ${group.answeredCount} of ${group.total} answered`}>
              <strong>{label}</strong>{" "}
              <span className="ex-part-count">
                {group.answeredCount} of {group.total}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ex-footer-end">
        <label className="ex-review">
          <input type="checkbox" checked={reviewChecked} onChange={onToggleReview} />
          Review
        </label>
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
        <button type="button" className="ex-icon-button ex-finish" aria-label="Finish the test" onClick={onFinish}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </button>
      </div>
    </nav>
  );
});
