"use client";

import { useMemo, useRef, useState } from "react";
import type { QuestionType } from "@prisma/client";

import { cn } from "@/lib/utils";
import { findAnswerEvidenceOffset } from "@/lib/exam/answer-evidence";
import { evaluateSlots, formatNumberRange, numberQuestions, slotStatus, type StoredVerdict } from "@/lib/exam/question-numbering";
import { chooseSetView, isChooseSet, slotAnswerRows } from "@/lib/exam/slot-answers";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER } from "@/lib/exam/question-types";
import type { ReviewEvidenceRange, ReviewNote, ReviewQuestionHighlight } from "@/lib/exam/review-model";
import { formatTimeUsed } from "@/lib/format";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import type { ExamAttachment } from "@/components/exam/passage-attachments";
import { MobileSplitTabs } from "@/components/exam/mobile-split-tabs";
import { ResizableSplit } from "@/components/exam/resizable-split";
import { ReviewPassagePanel, type EvidenceSpan, type ReviewHighlight } from "@/components/exam/review/review-passage-panel";
import { ReviewTranscriptPanel } from "@/components/exam/review/review-transcript-panel";
import { ReviewAudioPlayer, type ReviewAudioPlayerHandle } from "@/components/exam/review/review-audio-player";
import { scrollToVisible } from "@/components/exam/review/scroll-visible";
import {
  ReviewQuestionNavigator,
  type ReviewNavigatorItem,
  type ReviewQuestionStatus,
} from "@/components/exam/review/review-question-navigator";
import { ReviewQuestionCard } from "@/components/exam/review/review-question-card";
import type { PartBreakdown, QuestionTypeStat } from "@/lib/exam/result-insights";

export type ReviewQuestionData = {
  id: string;
  passageId: string | null;
  prompt: string;
  type: QuestionType;
  options: unknown;
  correctAnswer: unknown;
  studentAnswer: unknown;
  status: ReviewQuestionStatus;
  /** Phase L1 - the verdict stored when the attempt was handed in; the review goes by it, and only works the answer out from the key when there is none. */
  verdict?: StoredVerdict | null;
  /** Phase M - where a teacher CONFIRMED the answer is (never an unconfirmed suggestion): what "Show in passage" shows. */
  evidence?: ReviewEvidenceRange[];
  /** Phase M - what the student highlighted inside this question while sitting the test (read-only). */
  highlights?: ReviewQuestionHighlight[];
};

export type ReviewPassageData = {
  id: string;
  title: string;
  content: string;
  audioPath: string | null;
  audioUrl: string | null;
  orderIndex: number;
  attachments: ExamAttachment[];
};

function PerformanceAnalytics({
  partBreakdown,
  questionTypeBreakdown,
  sectionLabel,
}: {
  partBreakdown: PartBreakdown[];
  questionTypeBreakdown: QuestionTypeStat[];
  sectionLabel: string;
}) {
  if (partBreakdown.length < 2 && questionTypeBreakdown.length === 0) return null;

  return (
    <details className="border-border/70 bg-card group shrink-0 rounded-2xl border px-5 py-4 open:pb-5">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium tracking-wide uppercase select-none">
        Performance Analytics
        <span className="text-muted-foreground text-[11px] font-normal normal-case group-open:hidden">Show breakdown</span>
      </summary>
      <div className="mt-4 space-y-5">
        {partBreakdown.length > 1 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium">Accuracy by {sectionLabel}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {partBreakdown.map((part) => {
                const percent = part.total > 0 ? Math.round((part.correct / part.total) * 100) : null;
                return (
                  <div key={part.passageId ?? part.label} className="border-border/70 rounded-xl border px-3 py-2.5 text-center">
                    <p className="text-muted-foreground truncate text-xs font-medium">{part.label}</p>
                    <p className="font-display text-lg font-medium">
                      {part.correct}/{part.total}
                    </p>
                    {percent != null && <p className="text-muted-foreground text-xs">{percent}%</p>}
                    {/* Phase M - only for an attempt that recorded when the student moved between parts. */}
                    {part.seconds != null && (
                      <p className="text-muted-foreground text-[11px]" data-testid="part-time">
                        {formatTimeUsed(part.seconds)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {questionTypeBreakdown.length > 0 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium">Accuracy by question type</p>
            <div className="divide-border/70 divide-y">
              {questionTypeBreakdown.map((stat) => (
                <div key={stat.type} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{stat.label}</span>
                  <span className="text-success shrink-0 text-xs tabular-nums">{stat.correct} correct</span>
                  <span className="text-destructive shrink-0 text-xs tabular-nums">{stat.wrong} wrong</span>
                  <span className="text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums">
                    {Math.round(stat.accuracy * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

type StatusFilter = "all" | "wrong" | "unanswered";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "wrong", label: "Wrong" },
  { value: "unanswered", label: "Unanswered" },
];

/**
 * Phase 46 — orchestrates the whole Cambridge-style split-screen review:
 * left panel (passage or, for Listening, transcript) with real answer-
 * evidence highlighting for whichever question is active; right panel
 * (question navigator + per-question detail cards); a sticky audio player
 * for Listening. Shared by the student's own review page and the teacher's
 * read-only attempt review — `allowExplainMore` is false for the teacher
 * view since ExplainMore is authorized to the owning student only.
 *
 * Phase M - every number shows the student's answer, the right answer (alternatives included) and its stored verdict; "Show in passage" scrolls to and
 * marks the words a teacher confirmed as the evidence; the student's own highlights and notes are drawn read-only; and the list filters by all / wrong /
 * unanswered and by question type (the navigator follows the filter).
 */
export function ExamReviewSplit({
  testType,
  passages,
  questions,
  savedHighlights,
  notes = [],
  resultId,
  allowExplainMore,
  partBreakdown,
  questionTypeBreakdown,
}: {
  testType: "READING" | "LISTENING";
  passages: ReviewPassageData[];
  questions: ReviewQuestionData[];
  savedHighlights: ReviewHighlight[];
  /** Free-text notes the student kept during the attempt (read-only). */
  notes?: ReviewNote[];
  resultId: string;
  allowExplainMore: boolean;
  partBreakdown: PartBreakdown[];
  questionTypeBreakdown: QuestionTypeStat[];
}) {
  // Phase A — a matching / summary row covers several IELTS numbers, so numbering (and the navigator) is per NUMBER, not per row: a 40-question test shows 1–40 here exactly as it did in the exam.
  const numberedQuestions = useMemo(
    () =>
      numberQuestions(questions.map((question) => ({ ...question, blankKeys: question.type === "SUMMARY_COMPLETION" ? answerKeysOf(question.correctAnswer) : null }))).map((question) => ({
        ...question,
        slots: evaluateSlots(question, question.studentAnswer ?? undefined, question.verdict ?? (question.status === "correct")),
      })),
    [questions]
  );
  const [activeQuestionId, setActiveQuestionId] = useState(numberedQuestions[0]?.id ?? "");
  const [activePassageId, setActivePassageId] = useState(passages[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
  const [shown, setShown] = useState<{ questionId: string; slot: number; nonce: number } | null>(null);
  const [mobileTab, setMobileTab] = useState<"left" | "right">("right");
  const audioPlayerRef = useRef<ReviewAudioPlayerHandle>(null);

  const activeQuestion = numberedQuestions.find((question) => question.id === activeQuestionId) ?? null;

  // "Show in passage": the stretch a teacher confirmed, for the question number the student asked about.
  const shownEvidence = useMemo<(EvidenceSpan & { passageId: string }) | null>(() => {
    if (!shown) return null;
    const range = numberedQuestions.find((question) => question.id === shown.questionId)?.evidence?.find((candidate) => candidate.slot === shown.slot);
    return range ? { start: range.start, end: range.end, passageId: range.passageId, nonce: shown.nonce } : null;
  }, [shown, numberedQuestions]);

  const displayedPassageId = shownEvidence?.passageId ?? activeQuestion?.passageId ?? activePassageId;
  const displayedPassage = passages.find((passage) => passage.id === displayedPassageId) ?? passages[0] ?? null;
  const displayedPassageIndex = displayedPassage ? passages.findIndex((passage) => passage.id === displayedPassage.id) : -1;
  const displayedSectionLabel =
    passages.length > 1 && displayedPassageIndex >= 0 ? `Part ${displayedPassageIndex + 1} of ${passages.length}` : undefined;

  const evidence = useMemo<EvidenceSpan | null>(() => {
    if (shownEvidence) return shownEvidence;
    // No teacher evidence for this question: the older, honest fallback - the answer's own words, where they literally stand in the passage.
    if (!activeQuestion || !displayedPassage || activeQuestion.passageId !== displayedPassage.id) return null;
    if ((activeQuestion.evidence?.length ?? 0) > 0) return null;
    return findAnswerEvidenceOffset(displayedPassage.content, activeQuestion.type, activeQuestion.options, activeQuestion.correctAnswer);
  }, [shownEvidence, activeQuestion, displayedPassage]);

  const passageHighlights = useMemo(
    () => (displayedPassage ? savedHighlights.filter((highlight) => highlight.passageId === displayedPassage.id) : []),
    [savedHighlights, displayedPassage]
  );
  const passageNotes = useMemo(
    () => (displayedPassage ? notes.filter((note) => note.passageId === displayedPassage.id || (note.passageId == null && displayedPassage.id === passages[0]?.id)) : []),
    [notes, displayedPassage, passages]
  );

  // ---- filters --------------------------------------------------------------------------------------------------------------------------------------
  const typesPresent = useMemo(
    () => QUESTION_TYPE_ORDER.filter((type) => numberedQuestions.some((question) => question.type === type)).map((type) => ({ type, numbers: numberedQuestions.filter((question) => question.type === type).reduce((sum, question) => sum + question.span, 0) })),
    [numberedQuestions]
  );
  const inType = (question: { type: QuestionType }) => typeFilter === "all" || question.type === typeFilter;
  const slotMatches = (slot: { correct: boolean; answered: boolean }) => {
    const status = slotStatus(slot as Parameters<typeof slotStatus>[0]);
    return statusFilter === "all" || (statusFilter === "wrong" && status === "incorrect") || (statusFilter === "unanswered" && status === "skipped");
  };
  const counts = useMemo(() => {
    const slots = numberedQuestions.filter(inType).flatMap((question) => question.slots);
    return { all: slots.length, wrong: slots.filter((slot) => slotStatus(slot) === "incorrect").length, unanswered: slots.filter((slot) => slotStatus(slot) === "skipped").length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numberedQuestions, typeFilter]);
  const visibleQuestions = numberedQuestions.filter((question) => inType(question) && question.slots.some(slotMatches));

  function activateQuestion(id: string) {
    setActiveQuestionId(id);
    setShown(null);
    const question = numberedQuestions.find((item) => item.id === id);
    if (question?.passageId) setActivePassageId(question.passageId);
  }

  function jumpToQuestion(id: string) {
    activateQuestion(id);
    setMobileTab("right");
    requestAnimationFrame(() => scrollToVisible(`[id="review-question-${id}"]`, "start"));
  }

  function showEvidence(questionId: string, slot: number) {
    const range = numberedQuestions.find((question) => question.id === questionId)?.evidence?.find((candidate) => candidate.slot === slot);
    if (!range) return;
    setActiveQuestionId(questionId);
    setActivePassageId(range.passageId);
    setShown({ questionId, slot, nonce: Date.now() });
    setMobileTab("left");
  }

  const navigatorItems: ReviewNavigatorItem[] = visibleQuestions.flatMap((question) =>
    question.slots
      .filter(slotMatches)
      .map((slot) => ({
        id: `${question.id}:${slot.number}`,
        questionId: question.id,
        number: slot.number,
        status: slotStatus(slot),
      }))
  );

  const audioSrc = displayedPassage ? resolvePassageAudioSrc(displayedPassage) : null;

  const leftPanel =
    testType === "LISTENING" ? (
      <ReviewTranscriptPanel
        title={displayedPassage?.title ?? "Transcript"}
        sectionLabel={displayedSectionLabel}
        content={displayedPassage?.content ?? ""}
        evidence={evidence}
        audioPlayerRef={audioPlayerRef}
      />
    ) : (
      <ReviewPassagePanel
        title={displayedPassage?.title ?? "Passage"}
        content={displayedPassage?.content ?? ""}
        savedHighlights={passageHighlights}
        evidence={evidence}
        attachments={displayedPassage?.attachments ?? []}
        notes={passageNotes}
      />
    );

  const rightPanel = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border/70 shrink-0 space-y-3 border-b px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2" data-testid="review-filters" role="group" aria-label="Filter the questions">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              aria-pressed={statusFilter === filter.value}
              data-testid={`review-filter-${filter.value}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === filter.value ? "bg-primary text-primary-foreground border-primary" : "border-border/70 hover:bg-secondary"
              )}
            >
              {filter.label} <span className="tabular-nums opacity-80">{counts[filter.value]}</span>
            </button>
          ))}
          {typesPresent.length > 1 && (
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as QuestionType | "all")}
              aria-label="Filter by question type"
              data-testid="review-type-filter"
              className="border-border/70 bg-background ml-auto max-w-[14rem] rounded-full border px-3 py-1 text-xs"
            >
              <option value="all">All question types</option>
              {typesPresent.map(({ type, numbers }) => (
                <option key={type} value={type}>
                  {QUESTION_TYPE_META[type].label} ({numbers})
                </option>
              ))}
            </select>
          )}
        </div>
        {navigatorItems.length > 0 ? <ReviewQuestionNavigator questions={navigatorItems} currentQuestionId={activeQuestionId} onSelect={jumpToQuestion} /> : null}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="space-y-3" data-testid="review-list">
          {visibleQuestions.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm" data-testid="review-empty">
              {statusFilter === "wrong" ? "No wrong answers here - well done." : statusFilter === "unanswered" ? "Every question here was answered." : "No questions of this type."}
            </p>
          )}
          {visibleQuestions.map((question) => {
            const choiceLabelOf = (id: string) => {
              const choices = (typeof question.options === "object" && question.options !== null ? (question.options as { choices?: { id: string }[] }).choices : undefined) ?? [];
              return choices.some((choice) => choice.id === id) ? `Option ${id}` : null;
            };
            return (
              <ReviewQuestionCard
                key={question.id}
                numberLabel={formatNumberRange(question.startNumber, question.endNumber)}
                grouped={question.span > 1}
                correctInRow={question.slots.filter((slot) => slot.correct).length}
                span={question.span}
                prompt={question.prompt}
                type={question.type}
                lines={slotAnswerRows(question, question.studentAnswer ?? undefined, question.slots)}
                chooseSet={isChooseSet(question.type, question.options) ? chooseSetView(question, question.studentAnswer ?? undefined) : null}
                evidenceSlots={new Set((question.evidence ?? []).map((range) => range.slot))}
                onShowEvidence={(slot) => showEvidence(question.id, slot)}
                highlights={question.highlights ?? []}
                choiceLabelOf={choiceLabelOf}
                status={question.status}
                resultId={resultId}
                questionId={question.id}
                allowExplainMore={allowExplainMore}
                active={question.id === activeQuestionId}
                onActivate={() => activateQuestion(question.id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PerformanceAnalytics
        partBreakdown={partBreakdown}
        questionTypeBreakdown={questionTypeBreakdown}
        sectionLabel={testType === "LISTENING" ? "section" : "passage"}
      />

      {testType === "LISTENING" && audioSrc && (
        <div className="shrink-0">
          <ReviewAudioPlayer ref={audioPlayerRef} src={audioSrc} label={displayedPassage?.title ?? "Listening audio"} />
        </div>
      )}

      <div className="border-border/70 h-[75vh] min-h-[560px] overflow-hidden rounded-2xl border">
        <div className="hidden h-full md:block">
          <ResizableSplit
            leftClassName="overflow-hidden border-r border-border/70"
            rightClassName="overflow-hidden"
            leftLabel={testType === "LISTENING" ? "Transcript" : "Passage"}
            rightLabel="Questions"
            left={leftPanel}
            right={rightPanel}
          />
        </div>
        <div className="h-full md:hidden">
          <MobileSplitTabs leftLabel={testType === "LISTENING" ? "Transcript" : "Passage"} left={leftPanel} right={rightPanel} value={mobileTab} onValueChange={setMobileTab} />
        </div>
      </div>
    </div>
  );
}
