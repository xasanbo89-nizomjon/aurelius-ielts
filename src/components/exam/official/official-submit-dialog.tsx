"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";

/**
 * "Submit your test?" - what the tick in the footer opens. Shows how many questions are answered,
 * unanswered and flagged for review, and that there is no way back once the test is handed in.
 * "Return to test" closes it; "Submit" hands the test in. Built on the same accessible dialog
 * primitive as the rest of the app (focus stays inside, Escape closes it), but rendered INSIDE the
 * exam screen (`container`) so it follows the contrast and text-size settings, and flat.
 */
export function OfficialSubmitDialog({
  open,
  onOpenChange,
  container,
  totalQuestions,
  answeredCount,
  flaggedCount,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: HTMLElement | null;
  totalQuestions: number;
  answeredCount: number;
  flaggedCount: number;
  submitting: boolean;
  onConfirm: () => void;
}) {
  const unanswered = Math.max(0, totalQuestions - answeredCount);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (submitting ? undefined : onOpenChange(next))}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Overlay className="ex-overlay" />
        <DialogPrimitive.Content className="ex-dialog" onInteractOutside={(event) => event.preventDefault()} data-testid="submit-dialog">
          <DialogPrimitive.Title asChild>
            <h2>Submit your test?</h2>
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div>
              <dl className="ex-counts">
                <div>
                  <dt>Answered</dt>
                  <dd data-testid="count-answered">
                    {answeredCount} of {totalQuestions}
                  </dd>
                </div>
                <div data-warning={unanswered > 0 ? "true" : undefined}>
                  <dt>Unanswered</dt>
                  <dd data-testid="count-unanswered">{unanswered}</dd>
                </div>
                <div>
                  <dt>Flagged for review</dt>
                  <dd data-testid="count-flagged">{flaggedCount}</dd>
                </div>
              </dl>
              <p>Once you submit, you cannot go back to the test or change your answers.</p>
            </div>
          </DialogPrimitive.Description>
          <div className="ex-dialog-actions">
            <button type="button" className="ex-button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Return to test
            </button>
            <button type="button" className="ex-button ex-button-primary" onClick={onConfirm} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
