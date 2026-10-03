"use client";

import { memo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Flag } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavNumber, PassageGroup } from "@/lib/exam/passage-groups";

/**
 * The IELTS-style bottom navigation of the Reading exam:
 *
 *   PASSAGE 1  5/13   1 2 3 4 5 6 7 8 9 10 11 12 13
 *   PASSAGE 2  0/13   14 15 16 … 26
 *   PASSAGE 3  0/14   27 28 29 … 40
 *
 * Every number jumps straight to its question, every passage label jumps to the
 * passage. Each number shows its state at a glance and updates the moment an
 * answer changes: neutral = unanswered, solid green = answered, ring = the
 * question you are on, flag = marked for review.
 *
 * On a phone only the current passage's numbers are shown (the others collapse
 * to a pill that still jumps to that passage), so the bar never needs more than
 * two short rows.
 */
export const PassageNavBar = memo(function PassageNavBar({
  groups,
  activeNumber,
  activeGroupKey,
  compact,
  onSelectNumber,
  onSelectPassage,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  groups: PassageGroup[];
  activeNumber: number;
  activeGroupKey: string;
  compact: boolean;
  onSelectNumber: (number: NavNumber) => void;
  onSelectPassage: (group: PassageGroup) => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  // On a phone the numbers scroll sideways; keep the current one in view.
  useEffect(() => {
    if (!compact) return;
    rowRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [compact, activeNumber, activeGroupKey]);

  if (groups.length === 0) return null;

  const arrows = (
    <div className="flex shrink-0 items-center gap-1">
      <ArrowButton label="Previous question" disabled={!hasPrevious} onClick={onPrevious}>
        <ChevronLeft className="size-4" aria-hidden="true" />
      </ArrowButton>
      <ArrowButton label="Next question" disabled={!hasNext} onClick={onNext}>
        <ChevronRight className="size-4" aria-hidden="true" />
      </ArrowButton>
    </div>
  );

  if (compact) {
    const active = groups.find((group) => group.key === activeGroupKey) ?? groups[0];
    return (
      <nav aria-label="Passage and question navigation" className="border-border/70 bg-background shrink-0 border-t px-3 py-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {groups.map((group) => (
              <PassageLabel key={group.key} group={group} active={group.key === active.key} onSelect={onSelectPassage} compact />
            ))}
          </div>
          {arrows}
        </div>
        <div ref={rowRef} role="group" aria-label={`${active.label}, questions ${active.firstNumber} to ${active.lastNumber}`} className="flex gap-1.5 overflow-x-auto px-1.5 py-1.5">
          {active.numbers.map((item) => (
            <NumberButton key={item.number} item={item} current={item.number === activeNumber} onSelect={onSelectNumber} large />
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Passage and question navigation" className="border-border/70 bg-background shrink-0 border-t px-4 py-2 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-x-3" style={{ gridTemplateColumns: groups.map((group) => `minmax(0, ${Math.max(group.total, 4)}fr)`).join(" ") }}>
          {groups.map((group) => {
            const isActive = group.key === activeGroupKey;
            return (
              <div
                key={group.key}
                role="group"
                aria-label={`${group.label}, questions ${group.firstNumber} to ${group.lastNumber}`}
                className={cn("min-w-0 rounded-xl px-2 py-1.5 transition-colors", isActive ? "bg-secondary/70" : "bg-transparent")}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <PassageLabel group={group} active={isActive} onSelect={onSelectPassage} />
                  <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
                    {group.answeredCount}/{group.total}
                  </span>
                </div>
                <div className="flex flex-wrap gap-[3px]">
                  {group.numbers.map((item) => (
                    <NumberButton key={item.number} item={item} current={item.number === activeNumber} onSelect={onSelectNumber} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {arrows}
      </div>
    </nav>
  );
});

const PassageLabel = memo(function PassageLabel({
  group,
  active,
  onSelect,
  compact = false,
}: {
  group: PassageGroup;
  active: boolean;
  onSelect: (group: PassageGroup) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(group)}
      aria-pressed={active}
      aria-label={`Go to ${group.label}`}
      title={group.title || group.label}
      className={cn(
        "focus-visible:ring-ring/50 shrink-0 rounded-full text-xs font-semibold tracking-wide whitespace-nowrap uppercase outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        compact ? "px-3 py-1.5" : "px-3 py-1",
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/70"
      )}
    >
      {compact ? (
        <>
          {group.label.replace(/^Passage /, "P")} <span className="font-medium tabular-nums opacity-75">{group.answeredCount}/{group.total}</span>
        </>
      ) : (
        group.label
      )}
    </button>
  );
});

const NumberButton = memo(function NumberButton({
  item,
  current,
  onSelect,
  large = false,
}: {
  item: NavNumber;
  current: boolean;
  onSelect: (item: NavNumber) => void;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-current={current ? "true" : undefined}
      aria-label={`Question ${item.number}${item.answered ? ", answered" : ", not answered"}${item.flagged ? ", flagged for review" : ""}${current ? ", current question" : ""}`}
      data-state={item.answered ? "answered" : "unanswered"}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors outline-none",
        "focus-visible:ring-ring/60 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        large ? "size-9 text-sm" : "size-[26px]",
        item.answered
          ? "border-success bg-success text-success-foreground hover:opacity-90"
          : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
        current && "ring-accent ring-offset-background z-[1] scale-110 ring-2 ring-offset-2"
      )}
    >
      {item.number}
      {item.flagged && <Flag aria-hidden="true" className="text-accent absolute -top-1.5 -right-1.5 size-3 fill-current" />}
    </button>
  );
});

function ArrowButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="border-border bg-card text-foreground hover:bg-secondary focus-visible:ring-ring/50 flex size-9 items-center justify-center rounded-lg border outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}
