import { Fragment } from "react";

import type { GrammarIssue } from "@/lib/ai/writing";
import { cn } from "@/lib/utils";

/**
 * "Highlight issues clearly" (Phase 13, section 6). Each mistake's `mistake`
 * field is guaranteed (by the AI analysis prompt) to be an exact, verbatim
 * excerpt of the essay, so it can be located with a plain string search —
 * no character-offset storage needed. Finds each excerpt starting after the
 * end of the previous match, so repeated identical mistakes each get their
 * own highlight rather than only the first occurrence.
 */
const CATEGORY_COLORS: Record<GrammarIssue["category"], string> = {
  GRAMMAR: "bg-red-500/15 text-red-700 dark:text-red-400",
  WORD_FORM: "bg-red-500/15 text-red-700 dark:text-red-400",
  TENSE: "bg-red-500/15 text-red-700 dark:text-red-400",
  ARTICLE: "bg-red-500/15 text-red-700 dark:text-red-400",
  PREPOSITION: "bg-red-500/15 text-red-700 dark:text-red-400",
  SPELLING: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  LINKING_WORD: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  INFORMAL_LANGUAGE: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
};

type Segment = { text: string; issue?: GrammarIssue };

function buildSegments(content: string, issues: GrammarIssue[]): Segment[] {
  const matches: { start: number; end: number; issue: GrammarIssue }[] = [];

  for (const issue of issues) {
    if (!issue.mistake.trim()) continue;
    const start = content.indexOf(issue.mistake);
    if (start === -1) continue; // AI excerpt didn't match verbatim — skip rather than mis-highlight
    matches.push({ start, end: start + issue.mistake.length, issue });
  }

  matches.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue; // overlapping match — keep the earlier one
    if (match.start > cursor) segments.push({ text: content.slice(cursor, match.start) });
    segments.push({ text: content.slice(match.start, match.end), issue: match.issue });
    cursor = match.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });

  return segments;
}

export function EssayMistakeHighlighter({ content, issues }: { content: string; issues: GrammarIssue[] }) {
  const segments = buildSegments(content, issues);

  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {segments.map((segment, index) =>
        segment.issue ? (
          <mark
            key={index}
            title={`${segment.issue.explanation} → ${segment.issue.correction}`}
            className={cn("cursor-help rounded-sm px-0.5", CATEGORY_COLORS[segment.issue.category])}
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </div>
  );
}
