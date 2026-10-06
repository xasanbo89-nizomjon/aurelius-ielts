import { CheckCircle2, Crosshair, MinusCircle, StickyNote, XCircle } from "lucide-react";
import type { QuestionType } from "@prisma/client";

import { cn } from "@/lib/utils";
import type { SlotAnswerRow } from "@/lib/exam/slot-answers";
import { regionLabel, runsWithRanges, type ReviewQuestionHighlight } from "@/lib/exam/review-model";
import { ExplainMore } from "@/components/exam/explain-more";
import { Card, CardContent } from "@/components/ui/card";
import type { ReviewQuestionStatus } from "@/components/exam/review/review-question-navigator";

const STATUS_META: Record<ReviewQuestionStatus, { icon: typeof CheckCircle2; label: string; badgeClassName: string }> = {
  correct: { icon: CheckCircle2, label: "Correct", badgeClassName: "border-success/30 bg-success/10 text-success" },
  incorrect: { icon: XCircle, label: "Incorrect", badgeClassName: "border-destructive/30 bg-destructive/10 text-destructive" },
  skipped: { icon: MinusCircle, label: "Skipped", badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

/** A "Choose TWO" row is shown as one set (any order): what the student ticked and what was right. */
export type ReviewChooseSet = { student: string[]; correct: string[] };

/**
 * Phase 46 — the review-mode RIGHT panel's per-question card. Phase M - it shows, for EVERY question number, what the student answered, the right
 * answer (accepted alternatives included, as "colour / color") and whether it was right - all from the verdict stored when the attempt was handed in -
 * a "Show in passage" button wherever a teacher confirmed where the answer is, and what the student highlighted or noted in this question (read-only).
 * A matching or summary row is a small table, one line per number; a "Choose TWO" row is one set of letters in any order.
 */
export function ReviewQuestionCard({
  numberLabel,
  grouped,
  correctInRow,
  span,
  prompt,
  type,
  lines,
  chooseSet,
  evidenceSlots,
  onShowEvidence,
  highlights,
  choiceLabelOf,
  status,
  resultId,
  questionId,
  allowExplainMore,
  active,
  onActivate,
}: {
  /** "7" for a single question, "22–26" for a matching / summary row covering several. */
  numberLabel: string;
  grouped: boolean;
  /** How many of the row's `span` numbered questions were right — a grouped row can be partly correct. */
  correctInRow: number;
  span: number;
  prompt: string;
  type: QuestionType;
  /** One line per question number of the row. */
  lines: SlotAnswerRow[];
  chooseSet: ReviewChooseSet | null;
  /** The numbers (positions inside the row) whose answer a teacher located in the text. */
  evidenceSlots: ReadonlySet<number>;
  onShowEvidence: (slot: number) => void;
  highlights: ReviewQuestionHighlight[];
  choiceLabelOf: (id: string) => string | null;
  status: ReviewQuestionStatus;
  resultId: string;
  questionId: string;
  allowExplainMore: boolean;
  active: boolean;
  onActivate: () => void;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const promptRanges = highlights.filter((highlight) => highlight.region === "prompt").map((highlight) => ({ start: highlight.startOffset, end: highlight.endOffset }));
  const otherHighlights = highlights.filter((highlight) => highlight.region !== "prompt");
  const notedPrompt = highlights.filter((highlight) => highlight.region === "prompt" && highlight.note);
  const showButton = (slot: number, number: number, label = "Show in passage") =>
    evidenceSlots.has(slot) ? (
      <button
        key={`show-${slot}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onShowEvidence(slot);
        }}
        className="text-accent hover:bg-accent/10 focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full border border-current/30 px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2"
        aria-label={`${label}: question ${number}`}
        data-testid={`show-in-passage-${number}`}
      >
        <Crosshair className="size-3" aria-hidden="true" /> {label}
      </button>
    ) : null;

  return (
    <Card
      id={`review-question-${questionId}`}
      onClick={onActivate}
      onFocus={onActivate}
      className={cn("scroll-mt-4 cursor-pointer py-4 transition-shadow", active && "ring-2 ring-sky-500 ring-offset-2 ring-offset-background")}
      data-testid="review-card"
      data-question-id={questionId}
      data-status={status}
      data-type={type}
    >
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm font-medium">
            <span className="text-muted-foreground mr-1.5">{grouped ? `Questions ${numberLabel}` : `${numberLabel}.`}</span>
            {promptRanges.length > 0
              ? runsWithRanges(prompt, promptRanges).map((run, index) => (run.marked ? <mark key={index} className="exam-highlight">{run.text}</mark> : <span key={index}>{run.text}</span>))
              : prompt}
          </p>
          <span className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.badgeClassName)} data-testid="review-status">
            <Icon className="size-3.5" aria-hidden="true" /> {span > 1 && status !== "correct" && correctInRow > 0 ? `${correctInRow}/${span} correct` : meta.label}
          </span>
        </div>

        {chooseSet ? (
          <div className="space-y-2 text-xs">
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground font-medium">Your answers</dt>
                <dd className={status === "correct" ? undefined : "text-destructive"} data-testid="review-student-answer">
                  {chooseSet.student.length > 0 ? chooseSet.student.join("; ") : "Not answered"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground font-medium">Correct answers (any order)</dt>
                <dd className="text-success" data-testid="review-correct-answer">
                  {chooseSet.correct.join("; ")}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">{lines.map((line) => showButton(line.slot, line.number, `Show in passage (${line.number})`))}</div>
          </div>
        ) : grouped ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="review-lines">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">No.</th>
                  {lines.some((line) => line.label) && <th className="py-1 pr-3 font-medium">Item</th>}
                  <th className="py-1 pr-3 font-medium">Your answer</th>
                  <th className="py-1 pr-3 font-medium">Correct answer</th>
                  <th className="py-1 font-medium">
                    <span className="sr-only">Evidence</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {lines.map((line) => (
                  <tr key={line.number} data-testid={`review-line-${line.number}`} data-correct={line.isCorrect ? "true" : "false"} data-answered={line.answered ? "true" : "false"}>
                    <td className="py-1.5 pr-3 font-medium tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {line.isCorrect ? <CheckCircle2 className="text-success size-3.5" aria-label="correct" /> : line.answered ? <XCircle className="text-destructive size-3.5" aria-label="incorrect" /> : <MinusCircle className="size-3.5 text-amber-600" aria-label="not answered" />}
                        {line.number}
                      </span>
                    </td>
                    {lines.some((other) => other.label) && <td className="text-muted-foreground py-1.5 pr-3">{line.label ?? ""}</td>}
                    <td className={cn("py-1.5 pr-3 break-words", line.isCorrect ? undefined : "text-destructive")} data-testid={`review-student-${line.number}`}>
                      {line.student ?? "Not answered"}
                    </td>
                    <td className="text-success py-1.5 pr-3 break-words" data-testid={`review-correct-${line.number}`}>
                      {line.correct}
                    </td>
                    <td className="py-1.5">{showButton(line.slot, line.number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2">
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground font-medium">Your answer</dt>
                <dd className={status === "correct" ? undefined : status === "incorrect" ? "text-destructive" : "text-amber-600 dark:text-amber-400"} data-testid="review-student-answer">
                  {lines[0]?.student ?? "Not answered"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground font-medium">Correct answer</dt>
                <dd className="text-success" data-testid="review-correct-answer">
                  {lines[0]?.correct ?? "—"}
                </dd>
              </div>
            </dl>
            {lines[0] && showButton(0, lines[0].number)}
          </div>
        )}

        {(otherHighlights.length > 0 || notedPrompt.length > 0) && (
          <div className="border-border/60 space-y-1 border-t pt-2 text-xs" data-testid="review-question-marks">
            <p className="text-muted-foreground flex items-center gap-1 font-medium">
              <StickyNote className="size-3" aria-hidden="true" /> What you marked in this question
            </p>
            <ul className="space-y-1">
              {[...notedPrompt, ...otherHighlights].map((highlight) => (
                <li key={highlight.id}>
                  <span className="text-muted-foreground mr-1">{regionLabel(highlight.region, choiceLabelOf)}:</span>
                  <mark className="exam-highlight">{highlight.text}</mark>
                  {highlight.note && <span className="text-muted-foreground ml-1.5 italic">- {highlight.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {status === "incorrect" && allowExplainMore && (
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium">Explanation</p>
            <ExplainMore resultId={resultId} questionId={questionId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
