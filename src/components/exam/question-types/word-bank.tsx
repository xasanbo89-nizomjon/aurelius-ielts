"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A draggable list of answer options ("Sentence/Summary/Table completion,
 * Diagram labeling, Matching headings" all share this same word-bank
 * pattern). Native HTML5 drag-and-drop — no library needed for "drag a
 * chip into a blank". Also click-to-arm: tap a word, then tap a blank
 * (DroppableBlank/DroppableRow below) to place it — keeps this usable on
 * touch devices and via keyboard, where drag-and-drop alone would exclude
 * some students.
 */
export type WordBankItem = { value: string; label: string };

/** Plain strings work directly (the label IS the value, e.g. a word bank word); pass `{value, label}` pairs when the transferred value must differ from what's shown (e.g. Matching's option id vs its heading text). */
export function DraggableWordBank({
  words,
  armedWord,
  onArm,
  label = "Word bank",
}: {
  words: (string | WordBankItem)[];
  armedWord: string | null;
  onArm: (word: string | null) => void;
  label?: string;
}) {
  const items: WordBankItem[] = words.map((word) => (typeof word === "string" ? { value: word, label: word } : word));

  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs font-medium">
        {label} — drag one into place, or tap it then tap where it goes
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const isArmed = armedWord === item.value;
          return (
            <button
              key={item.value}
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", item.value);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onArm(isArmed ? null : item.value)}
              aria-pressed={isArmed}
              className={cn(
                "cursor-grab rounded-full border px-3 py-1 text-xs font-medium transition-colors select-none active:cursor-grabbing",
                "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
                isArmed ? "border-accent bg-accent/15 text-accent" : "border-border bg-card hover:bg-secondary/60"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Wraps one blank (an <Input> or similar) as a real drop target, plus click-to-place when a word bank chip is armed. */
export function DroppableBlank({
  onPlace,
  armedWord,
  className,
  children,
}: {
  onPlace: (word: string) => void;
  armedWord: string | null;
  className?: string;
  children: ReactNode;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <span
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        const word = event.dataTransfer.getData("text/plain");
        if (word) onPlace(word);
      }}
      onClick={() => {
        if (armedWord) onPlace(armedWord);
      }}
      className={cn(
        "inline-block rounded-md transition-shadow",
        isDragOver && "ring-accent ring-2",
        armedWord && "ring-accent/40 cursor-pointer ring-2 ring-dashed",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Same drop-target behavior as DroppableBlank, but for a block-level row (e.g. a Matching prompt row) instead of an inline blank. */
export function DroppableRow({
  onPlace,
  armedWord,
  className,
  children,
}: {
  onPlace: (word: string) => void;
  armedWord: string | null;
  className?: string;
  children: ReactNode;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        const word = event.dataTransfer.getData("text/plain");
        if (word) onPlace(word);
      }}
      onClick={() => {
        if (armedWord) onPlace(armedWord);
      }}
      className={cn(
        "rounded-lg transition-colors",
        isDragOver && "bg-accent/10 ring-accent ring-2",
        armedWord && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}
