"use client";

import { forwardRef, type ClipboardEvent, type ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * What a copy out of the passage typically carries along — line breaks from
 * the paragraph's wrapping, tabs, runs of spaces — turned into single-spaced
 * text, so a pasted answer isn't graded wrong for invisible whitespace. A
 * leading / trailing space is kept only where it separates the pasted text
 * from words already in the box.
 */
export function tidyPaste(raw: string, before: string, after: string): string {
  let tidy = raw.replace(/[\s ]+/g, " ");
  if (before === "" || /\s$/.test(before)) tidy = tidy.replace(/^ /, "");
  if (after === "" || /^\s/.test(after)) tidy = tidy.replace(/ $/, "");
  return tidy;
}

/**
 * The one text box every typed answer uses (gap fill, sentence completion,
 * short answer, summary / notes / table / flow-chart blanks).
 *
 *  - Pasting works exactly as the browser does it; the only thing touched is
 *    stray whitespace in text copied from the passage (see `tidyPaste`).
 *  - No autofill, autocorrect, auto-capitalisation or spellcheck squiggles — an
 *    exam answer is not prose, and "correcting" "Neanderthals" helps nobody.
 *  - `data-answer-box` lets the exam move between boxes with Enter / ↑ / ↓.
 */
export const AnswerInput = forwardRef<
  HTMLInputElement,
  Omit<ComponentProps<typeof Input>, "value" | "onChange"> & { value: string; onValueChange: (value: string) => void }
>(function AnswerInput({ value, onValueChange, className, ...props }, ref) {
  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const raw = event.clipboardData.getData("text/plain");
    if (!raw) return;
    const input = event.currentTarget;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const tidy = tidyPaste(raw, before, after);
    if (tidy === raw) return; // already clean — leave the native paste (caret, undo) completely alone

    event.preventDefault();
    onValueChange(before + tidy + after);
    const caret = before.length + tidy.length;
    requestAnimationFrame(() => {
      try {
        input.setSelectionRange(caret, caret);
      } catch {
        // The input was removed or is not focusable any more — nothing to restore.
      }
    });
  }

  return (
    <Input
      ref={ref}
      type="text"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onPaste={handlePaste}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      enterKeyHint="next"
      data-answer-box=""
      data-filled={value.trim().length > 0 ? "true" : "false"}
      className={cn("data-[filled=true]:border-primary/45 data-[filled=true]:bg-secondary/60", className)}
      {...props}
    />
  );
});
