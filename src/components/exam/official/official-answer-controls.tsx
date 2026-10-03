"use client";

import { useState, type ClipboardEvent, type MouseEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { tidyPaste } from "@/components/exam/answer-input";

/**
 * The typed-answer box of the official screen: a flat box that sits INSIDE the sentence, shows its
 * question number while empty (the number goes away as soon as something is typed — it is the
 * placeholder), and holds roughly 17 characters.
 *
 * Behaves exactly like the legacy `AnswerInput`: pasting only tidies stray whitespace out of text
 * copied from the passage (`tidyPaste`), no autofill / autocorrect / spellcheck, and
 * `data-answer-box` lets the exam move between boxes with Enter and the arrow keys.
 */
export function OfficialBlank({
  id,
  value,
  onValueChange,
  number,
  label,
  ownLine = false,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  /** The IELTS question number this box answers. */
  number: number | null;
  label: string;
  ownLine?: boolean;
}) {
  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const raw = event.clipboardData.getData("text/plain");
    if (!raw) return;
    const input = event.currentTarget;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const tidy = tidyPaste(raw, before, after);
    if (tidy === raw) return; // already clean — leave the native paste (caret, undo) alone

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
    <input
      id={id}
      type="text"
      className={cn("ex-blank", ownLine && "ex-blank-own-line")}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      onPaste={handlePaste}
      placeholder={number != null ? String(number) : undefined}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      enterKeyHint="next"
      data-answer-box=""
      data-filled={value.trim().length > 0 ? "true" : "false"}
      data-question-number={number ?? undefined}
      aria-label={label}
    />
  );
}

/** A choice's text is highlighted by dragging across it, which ends in a click on its label — a click that ends a text selection must not also pick (or un-pick) the answer. */
export function ignoreClickThatEndsASelection(event: MouseEvent<HTMLElement>) {
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) event.preventDefault();
}

/** Makes one answer box a drop target for a word-bank word, and lets a click place the word that was picked up ("armed"). */
export function OfficialDrop({ onPlace, armedWord, children }: { onPlace: (word: string) => void; armedWord: string | null; children: ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <span
      className="ex-drop"
      data-over={over ? "true" : undefined}
      data-armed={armedWord ? "true" : undefined}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const word = event.dataTransfer.getData("text/plain");
        if (word) onPlace(word);
      }}
      onClick={() => {
        if (armedWord) onPlace(armedWord);
      }}
    >
      {children}
    </span>
  );
}

/** The box of words a completion task lets you choose from — drag a word onto a gap, or click it and then click the gap. */
export function OfficialWordBank({ words, armedWord, onArm, label = "Word bank" }: { words: readonly string[]; armedWord: string | null; onArm: (word: string | null) => void; label?: string }) {
  return (
    <div className="ex-bank">
      <p className="ex-list-title">{label}</p>
      <div className="ex-bank-words">
        {words.map((word) => (
          <button
            key={word}
            type="button"
            draggable
            className="ex-bank-word"
            aria-pressed={armedWord === word}
            title="Drag onto a gap, or click it and then click the gap"
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", word);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onArm(armedWord === word ? null : word)}
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}
