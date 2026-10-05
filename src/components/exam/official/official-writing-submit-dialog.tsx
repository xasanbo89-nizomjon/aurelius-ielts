"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";

/**
 * "Submit your writing?" - what the tick in the footer opens. Says which parts have something written in them and that there is no
 * way back once it is handed in. It is information, not a gate: nothing here counts words or asks for a minimum - an empty part
 * is allowed and is handed in as no response. Same flat dialog as the Reading one, rendered inside the exam screen so it follows
 * the contrast and text-size settings.
 */
export function OfficialWritingSubmitDialog({
  open,
  onOpenChange,
  container,
  parts,
  submitting,
  onConfirm,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: HTMLElement | null;
  parts: { label: string; answered: boolean }[];
  submitting: boolean;
  onConfirm: () => void;
  onCloseAutoFocus?: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (submitting ? undefined : onOpenChange(next))}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Overlay className="ex-overlay" />
        <DialogPrimitive.Content
          className="ex-dialog"
          onInteractOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            if (!onCloseAutoFocus) return;
            event.preventDefault();
            onCloseAutoFocus();
          }}
          data-testid="submit-dialog"
        >
          <DialogPrimitive.Title asChild>
            <h2>Submit your writing?</h2>
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div>
              <dl className="ex-counts">
                {parts.map((part) => (
                  <div key={part.label} data-warning={part.answered ? undefined : "true"}>
                    <dt>{part.label}</dt>
                    <dd data-testid={`submit-${part.label.toLowerCase().replace(/\s+/g, "-")}`}>{part.answered ? "Answered" : "Not answered"}</dd>
                  </div>
                ))}
              </dl>
              <p>Once you submit, you cannot go back to your writing or change it.</p>
            </div>
          </DialogPrimitive.Description>
          <div className="ex-dialog-actions">
            <button type="button" className="ex-button" onClick={() => onOpenChange(false)} disabled={submitting}>
              Return to test
            </button>
            <button type="button" className="ex-button ex-button-primary" onClick={onConfirm} disabled={submitting} data-testid="writing-confirm-submit">
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
