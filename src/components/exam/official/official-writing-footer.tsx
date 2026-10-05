"use client";

import { memo } from "react";

export type WritingFooterPart = { label: string; answered: boolean };

/**
 * The bar along the bottom of the Writing screen:
 *
 *   [ Part 1 ]  [ Part 2 ]                                  ←  →  ✓
 *
 * One button per part of the test. The part you are in is boxed; a part with something written in it is filled (and carries a
 * tick), so the bar shows at a glance what has been started. ← and → move between the parts, ✓ asks to hand the writing in.
 * (A task taken on its own has just the one part.) Built from the same pieces as the Reading footer.
 */
export const OfficialWritingFooter = memo(function OfficialWritingFooter({
  parts,
  activeIndex,
  onSelect,
  onPrevious,
  onNext,
  onFinish,
  finishDisabled,
}: {
  parts: WritingFooterPart[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
  finishDisabled: boolean;
}) {
  return (
    <nav className="ex-footer" aria-label="Writing parts">
      <div className="ex-parts">
        {parts.map((part, index) => (
          <button
            key={part.label}
            type="button"
            className="ex-part-button ex-writing-part"
            onClick={() => onSelect(index)}
            aria-current={index === activeIndex ? "true" : undefined}
            data-state={part.answered ? "answered" : "unanswered"}
            aria-label={`${part.label}, ${part.answered ? "answered" : "not answered yet"}${index === activeIndex ? ", current part" : ""}`}
            data-testid={`writing-part-${index + 1}`}
          >
            <strong>{part.label}</strong>
            <span className="ex-part-mark" aria-hidden="true">
              ✓
            </span>
          </button>
        ))}
      </div>

      <div className="ex-footer-end">
        <button type="button" className="ex-icon-button" aria-label="Previous part" disabled={activeIndex <= 0} onClick={onPrevious}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <button type="button" className="ex-icon-button" aria-label="Next part" disabled={activeIndex >= parts.length - 1} onClick={onNext}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <button type="button" className="ex-icon-button ex-finish" aria-label="Finish the test" disabled={finishDisabled} onClick={onFinish} data-testid="writing-submit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </button>
      </div>
    </nav>
  );
});
