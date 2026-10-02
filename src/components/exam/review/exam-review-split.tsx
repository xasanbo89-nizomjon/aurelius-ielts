"use client";

import { useMemo, useRef, useState } from "react";
import type { QuestionType } from "@prisma/client";

import { findAnswerEvidenceOffset } from "@/lib/exam/answer-evidence";
import { evaluateSlots, formatNumberRange, numberQuestions, slotStatus } from "@/lib/exam/question-numbering";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import type { ExamAttachment } from "@/components/exam/passage-attachments";
import { MobileSplitTabs } from "@/components/exam/mobile-split-tabs";
import { ResizableSplit } from "@/components/exam/resizable-split";
import { ReviewPassagePanel, type ReviewHighlight } from "@/components/exam/review/review-passage-panel";
import { ReviewTranscriptPanel } from "@/components/exam/review/review-transcript-panel";
import { ReviewAudioPlayer, type ReviewAudioPlayerHandle } from "@/components/exam/review/review-audio-player";
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

/**
 * Phase 46 — orchestrates the whole Cambridge-style split-screen review:
 * left panel (passage or, for Listening, transcript) with real answer-
 * evidence highlighting for whichever question is active; right panel
 * (question navigator + per-question detail cards); a sticky audio player
 * for Listening. Shared by the student's own review page and the teacher's
 * read-only attempt review — `allowExplainMore` is false for the teacher
 * view since ExplainMore is authorized to the owning student only.
 */
export function ExamReviewSplit({
  testType,
  passages,
  questions,
  savedHighlights,
  resultId,
  allowExplainMore,
  partBreakdown,
  questionTypeBreakdown,
}: {
  testType: "READING" | "LISTENING";
  passages: ReviewPassageData[];
  questions: ReviewQuestionData[];
  savedHighlights: ReviewHighlight[];
  resultId: string;
  allowExplainMore: boolean;
  partBreakdown: PartBreakdown[];
  questionTypeBreakdown: QuestionTypeStat[];
}) {
  // Phase A — a matching / summary row covers several IELTS numbers, so numbering (and the navigator) is per NUMBER, not per row: a 40-question test shows 1–40 here exactly as it did in the exam.
  const numberedQuestions = useMemo(
    () =>
      numberQuestions(questions).map((question) => ({
        ...question,
        slots: evaluateSlots(question, question.studentAnswer ?? undefined, question.status === "correct"),
      })),
    [questions]
  );
  const [activeQuestionId, setActiveQuestionId] = useState(numberedQuestions[0]?.id ?? "");
  const [activePassageId, setActivePassageId] = useState(passages[0]?.id ?? "");
  const audioPlayerRef = useRef<ReviewAudioPlayerHandle>(null);

  const activeQuestion = numberedQuestions.find((question) => question.id === activeQuestionId) ?? null;
  const displayedPassageId = activeQuestion?.passageId ?? activePassageId;
  const displayedPassage = passages.find((passage) => passage.id === displayedPassageId) ?? passages[0] ?? null;
  const displayedPassageIndex = displayedPassage ? passages.findIndex((passage) => passage.id === displayedPassage.id) : -1;
  const displayedSectionLabel =
    passages.length > 1 && displayedPassageIndex >= 0 ? `Part ${displayedPassageIndex + 1} of ${passages.length}` : undefined;

  const evidence = useMemo(() => {
    if (!activeQuestion || !displayedPassage || activeQuestion.passageId !== displayedPassage.id) return null;
    return findAnswerEvidenceOffset(displayedPassage.content, activeQuestion.type, activeQuestion.options, activeQuestion.correctAnswer);
  }, [activeQuestion, displayedPassage]);

  const passageHighlights = useMemo(
    () => (displayedPassage ? savedHighlights.filter((highlight) => highlight.passageId === displayedPassage.id) : []),
    [savedHighlights, displayedPassage]
  );

  function activateQuestion(id: string) {
    setActiveQuestionId(id);
    const question = numberedQuestions.find((item) => item.id === id);
    if (question?.passageId) setActivePassageId(question.passageId);
  }

  function jumpToQuestion(id: string) {
    activateQuestion(id);
    document.getElementById(`review-question-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const navigatorItems: ReviewNavigatorItem[] = numberedQuestions.flatMap((question) =>
    question.slots.map((slot) => ({
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
      />
    );

  const rightPanel = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border/70 shrink-0 border-b px-4 py-3 sm:px-6">
        <ReviewQuestionNavigator questions={navigatorItems} currentQuestionId={activeQuestionId} onSelect={jumpToQuestion} />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="space-y-3">
          {numberedQuestions.map((question) => (
            <ReviewQuestionCard
              key={question.id}
              numberLabel={formatNumberRange(question.startNumber, question.endNumber)}
              grouped={question.span > 1}
              correctInRow={question.slots.filter((slot) => slot.correct).length}
              span={question.span}
              prompt={question.prompt}
              type={question.type}
              options={question.options}
              studentAnswer={question.studentAnswer}
              correctAnswer={question.correctAnswer}
              status={question.status}
              resultId={resultId}
              questionId={question.id}
              allowExplainMore={allowExplainMore}
              active={question.id === activeQuestionId}
              onActivate={() => activateQuestion(question.id)}
            />
          ))}
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
          <MobileSplitTabs leftLabel={testType === "LISTENING" ? "Transcript" : "Passage"} left={leftPanel} right={rightPanel} />
        </div>
      </div>
    </div>
  );
}
