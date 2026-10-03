"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";

/**
 * "Finish the test?" — what the ✓ button in the footer opens. States plainly how many questions are
 * answered, not answered and marked for review, and that there is no way back once the test is
 * handed in. Built on the same accessible dialog primitive as the rest of the app (focus stays
 * inside, Escape closes it), but rendered INSIDE the exam screen (`container`) so it follows the
 * contrast and text-size settings, and flat.
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
  const plural = (count: number) => (count === 1 ? "question" : "questions");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (submitting ? undefined : onOpenChange(next))}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Overlay className="ex-overlay" />
        <DialogPrimitive.Content className="ex-dialog" onInteractOutside={(event) => event.preventDefault()} data-testid="submit-dialog">
          <DialogPrimitive.Title asChild>
            <h2>Finish the test?</h2>
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div>
              <p>
                You have answered {answeredCount} of {totalQuestions} {plural(totalQuestions)}.
              </p>
              {unanswered > 0 && (
                <p className="ex-dialog-warning">
                  {unanswered} {plural(unanswered)} not answered.
                </p>
              )}
              {flaggedCount > 0 && (
                <p>
                  {flaggedCount} {plural(flaggedCount)} marked for review.
                </p>
              )}
              <p>Once you finish, you cannot go back to the test or change your answers.</p>
            </div>
          </DialogPrimitive.Description>
          <div className="ex-dialog-actions">
            <button type="button" className="ex-button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Return to test
            </button>
            <button type="button" className="ex-button ex-button-primary" onClick={onConfirm} disabled={submitting}>
              {submitting ? "Submitting…" : "Finish test"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
