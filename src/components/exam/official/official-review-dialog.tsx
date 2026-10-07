"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";

import type { ReviewNumber } from "@/lib/exam/official-review";
import { percentOf } from "@/lib/exam/test-format";

/**
 * Phase M2 - the first thing a student sees after handing in: their band score, their raw score and one line per question number - what they answered and
 * what was right - green when right, red when wrong or left empty. Closing it leaves the review. Drawn INSIDE the exam screen (`container`), so it follows the
 * contrast and text-size settings, like every other dialog of the exam.
 */
export function OfficialReviewDialog({
  open,
  onOpenChange,
  container,
  band,
  custom = false,
  rawScore,
  totalPoints,
  numbers,
  detailsHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: HTMLElement | null;
  band: number | null;
  /** Phase Q - a Custom test has no band: the dialog shows the score and the percentage instead. */
  custom?: boolean;
  rawScore: number;
  totalPoints: number;
  numbers: readonly ReviewNumber[];
  /** The older results page: accuracy by part and question type, strong and weak areas. */
  detailsHref: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Overlay className="ex-overlay" />
        <DialogPrimitive.Content className="ex-dialog ex-results" data-testid="results-dialog">
          <DialogPrimitive.Title asChild>
            <h2>Your results</h2>
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <dl className="ex-results-scores">
              {custom ? (
                <div>
                  <dt>Percentage</dt>
                  <dd data-testid="dialog-percent">{percentOf(rawScore, totalPoints) != null ? `${percentOf(rawScore, totalPoints)}%` : "—"}</dd>
                </div>
              ) : (
                <div>
                  <dt>Band score</dt>
                  <dd data-testid="dialog-band">{band != null ? band.toFixed(1) : "—"}</dd>
                </div>
              )}
              <div>
                <dt>{custom ? "Score" : "Raw score"}</dt>
                <dd data-testid="dialog-raw">
                  {rawScore}/{totalPoints}
                </dd>
              </div>
            </dl>
          </DialogPrimitive.Description>
          <div className="ex-results-scroll">
            <table className="ex-results-table" data-testid="dialog-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Your answer</th>
                  <th scope="col">Correct answer</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((item) => (
                  <tr key={item.number} data-outcome={item.outcome} data-testid={`dialog-row-${item.number}`}>
                    <td>
                      {item.number}
                      <span className="ex-sr-only"> {item.outcome === "correct" ? "correct" : item.outcome === "skipped" ? "not answered" : "wrong"}</span>
                    </td>
                    <td>{item.student ?? "—"}</td>
                    <td>{item.correct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ex-dialog-actions">
            <a className="ex-button" href={detailsHref} data-testid="results-details">
              Full results page
            </a>
            <button type="button" className="ex-button ex-button-primary" onClick={() => onOpenChange(false)} data-testid="results-close">
              Close
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
