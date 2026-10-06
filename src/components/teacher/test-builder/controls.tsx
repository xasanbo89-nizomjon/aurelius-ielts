"use client";

import { useEffect, useState, type ComponentProps } from "react";

import { alternativesText, expandAlternatives } from "@/lib/exam/builder-model";
import { cn } from "@/lib/utils";

export const FIELD = "border-input bg-background focus-visible:ring-ring/40 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 disabled:opacity-60";

/** A plain select that looks like the other fields (many small selects in a long form are lighter this way than the Radix one). */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cn(FIELD, "h-9 py-0", className)} />;
}

/** The number a question has on the student's screen, drawn as a small badge ("7" or "14-18"). */
export function NumberBadge({ first, last }: { first: number; last?: number }) {
  return (
    <span className="bg-secondary text-secondary-foreground inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums" data-testid="question-number">
      {last != null && last !== first ? `${first}–${last}` : first}
    </span>
  );
}

/**
 * One typed answer with accepted alternatives: "colour / color", "(the) library". The text is what the teacher types; the list underneath is what is
 * stored and scored (every alternative, with and without the words in brackets).
 */
export function AnswerInput({ answers, onChange, placeholder = "Answer (alternatives: colour / color, optional words: (the) library)", id, "aria-label": ariaLabel }: { answers: string[]; onChange: (answers: string[]) => void; placeholder?: string; id?: string; "aria-label"?: string }) {
  const [text, setText] = useState(() => alternativesText(answers));

  // Something else changed the answer (the pasted key): show it.
  useEffect(() => {
    if (alternativesText(answers) !== alternativesText(expandAlternatives(text))) setText(alternativesText(answers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const expanded = expandAlternatives(text);
  return (
    <div className="space-y-1">
      <input
        id={id}
        aria-label={ariaLabel}
        className={FIELD}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          onChange(expandAlternatives(event.target.value));
        }}
      />
      {(expanded.length > 1 || /\(/.test(text)) && expanded.length > 0 && (
        <p className="text-muted-foreground text-xs" data-testid="accepted-answers">
          Accepted: {expanded.map((answer) => `"${answer}"`).join(", ")}
        </p>
      )}
    </div>
  );
}
