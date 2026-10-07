"use client";

import "./official-exam.css";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { QuestionType } from "@prisma/client";

import { adjacentNumber, buildPassageGroups, type PassageGroup } from "@/lib/exam/passage-groups";
import type { QuestionGroupInfo } from "@/lib/exam/question-groups";
import { formatNumberRange } from "@/lib/exam/question-numbering";
import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER } from "@/lib/exam/question-types";
import { buildReviewRows, evidenceNumberOf, numberMatchesStatus, type ReviewSource, type ReviewStatusFilter } from "@/lib/exam/official-review";
import type { ReviewEvidenceRange, ReviewNote, ReviewQuestionHighlight } from "@/lib/exam/review-model";
import { examPreferencesCookie, textSizePx, type ExamPreferences } from "@/lib/exam/ui-preferences";
import { questionRegion } from "@/lib/exam/text-highlight";
import type { ExamPassage } from "@/components/exam/exam-runner";
import { useMediaQuery } from "@/components/exam/use-media-query";
import { OfficialHeader } from "@/components/exam/official/official-header";
import { partLabelOf } from "@/components/exam/official/official-footer";
import { OfficialPassage, type PassageEvidence } from "@/components/exam/official/official-passage";
import { OfficialQuestionGroups } from "@/components/exam/official/official-questions";
import { OfficialSplit } from "@/components/exam/official/official-split";
import { OfficialRangesContext, type DrawnHighlight } from "@/components/exam/official/official-text";
import { ReviewContext, type ReviewApi, type ReviewExplanation, type ReviewRowView } from "@/components/exam/official/official-review-context";
import { OfficialReviewFooter, type ReviewFooterNumber, type ReviewFooterPart } from "@/components/exam/official/official-review-footer";
import { OfficialReviewDialog } from "@/components/exam/official/official-review-dialog";
import { ReviewAudioPlayer } from "@/components/exam/review/review-audio-player";

/** A question as the review gets it: what the test asked, what the student saved, what it was scored with, and what a teacher added (evidence, an approved explanation). */
export type ReviewScreenQuestion = ReviewSource & {
  /** Only what a teacher CONFIRMED (see confirmedEvidenceRanges). */
  evidence: ReviewEvidenceRange[];
  /** What the student highlighted inside this question while sitting the test. */
  highlights: ReviewQuestionHighlight[];
  /** The approved explanation (and only an approved one that still matches the question), or null. */
  explanation: ReviewExplanation | null;
};

/** A highlight the student made in a passage, already put back on the words it was made on. */
export type ReviewPassageHighlight = { id: string; passageId: string; start: number; end: number; note: string | null };

export type OfficialReviewProps = {
  resultId: string;
  testType: "READING" | "LISTENING";
  candidateName: string;
  preferencesCookieName: string;
  initialPreferences: ExamPreferences;
  band: number | null;
  rawScore: number;
  totalPoints: number;
  passages: ExamPassage[];
  groups: QuestionGroupInfo[];
  /** In test order. */
  questions: ReviewScreenQuestion[];
  passageHighlights: ReviewPassageHighlight[];
  /** Free-text notes the student kept (shown in the results dialog is not their place: they are listed at the end of the passage). */
  notes: ReviewNote[];
  /** Open the results dialog on arrival (the student has just handed in). */
  openResults: boolean;
  exitHref: string;
};

const EMPTY: readonly DrawnHighlight[] = [];
const noop = () => undefined;

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Scrolls ONE pane of the screen (never the page, never an ancestor that hides its overflow) so that `el` is at the top or in the middle of it. */
function scrollPaneTo(el: HTMLElement | null, block: "start" | "center") {
  if (!el) return;
  const pane = el.closest<HTMLElement>(".ex-pane");
  if (!pane) return;
  const paneRect = pane.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const delta = rect.top - paneRect.top - (block === "center" ? Math.max(0, (paneRect.height - rect.height) / 2) : 12);
  pane.scrollTo({ top: Math.max(0, pane.scrollTop + delta), behavior: reducedMotion() ? "auto" : "smooth" });
}

type Section = { passage: ExamPassage | undefined; rows: ReturnType<typeof buildReviewRows<ScreenQuestionForRows>>[number][] };
type ScreenQuestionForRows = ReviewScreenQuestion;
type PendingScroll = { number: number; question: boolean; evidence: boolean; nonce: number };

/**
 * Phase M2 - the review of a finished Reading or Listening test, in the official exam layout and read-only: the same header (with "Band score: X" where the
 * clock was), the same part bar, the same split screen and question rows, the same footer, the same three contrast settings and text sizes.
 *
 *  - every question number is green (right) or red (wrong or left empty) - in its box, in the footer and in the results dialog - with a tick or a cross and
 *    "Answer: ..." (accepted alternatives included); what the student picked or typed stays on the screen, the controls cannot be changed;
 *  - the passage shows the words a teacher CONFIRMED as the evidence, light green with a small [n] badge: pressing a question scrolls the passage to them,
 *    pressing a badge scrolls to the question; the student's own yellow highlights and notes are drawn as they were made;
 *  - "Explain more" and "What's the trap?" open the stored explanation a teacher approved (nothing is generated here: no student ever triggers an AI call);
 *  - the filters of the earlier review (all / wrong / unanswered / by question type) are in the part bar.
 *
 * Every verdict is the one stored when the attempt was handed in; nothing here can change a score.
 */
export function OfficialReview(props: OfficialReviewProps) {
  const { testType, passages, groups, questions, passageHighlights, band, rawScore, totalPoints } = props;

  const [preferences, setPreferences] = useState(props.initialPreferences);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [mobileTab, setMobileTab] = useState<"left" | "right">("right");
  const [dialogOpen, setDialogOpen] = useState(props.openResults);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<QuestionType | "all">("all");
  const [sectionIndex, setSectionIndex] = useState(0);
  /** A passage shown on the left although it is not the part's own (a teacher marked a question's evidence in another passage). */
  const [leftOverride, setLeftOverride] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingScroll | null>(null);
  const [noteView, setNoteView] = useState<{ text: string; left: number; top: number } | null>(null);
  const nonce = useRef(0);

  /** Closing the results dialog leaves the review; the address no longer says "just handed in", so a reload does not open it again. */
  const changeDialog = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("results")) {
      try {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      } catch {
        // The address stays as it is; nothing else depends on it.
      }
    }
  }, []);

  const changePreferences = useCallback(
    (next: ExamPreferences) => {
      setPreferences(next);
      try {
        document.cookie = examPreferencesCookie(props.preferencesCookieName, next, window.location.protocol === "https:");
      } catch {
        // Cookies blocked: the setting still applies for this visit, it just is not remembered.
      }
    },
    [props.preferencesCookieName]
  );

  // ---- the rows, their numbers and the parts -------------------------------------------------------------------------------------------------------
  const rows = useMemo(() => buildReviewRows(questions, groups), [questions, groups]);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const sortedPassages = useMemo(() => [...passages].sort((a, b) => a.orderIndex - b.orderIndex), [passages]);

  const sections: Section[] = useMemo(() => {
    if (sortedPassages.length === 0) return [{ passage: undefined, rows }];
    const indexById = new Map(sortedPassages.map((passage, index) => [passage.id, index]));
    const last = sortedPassages.length - 1;
    const built: Section[] = sortedPassages.map((passage) => ({ passage, rows: [] }));
    for (const row of rows) built[row.passageId != null ? (indexById.get(row.passageId) ?? last) : last].rows.push(row);
    const withQuestions = built.filter((section) => section.rows.length > 0);
    return withQuestions.length > 0 ? withQuestions : built;
  }, [sortedPassages, rows]);
  const section = sections[Math.min(sectionIndex, sections.length - 1)];

  const groupsOfParts: PassageGroup[] = useMemo(
    () =>
      buildPassageGroups(
        sortedPassages.map((passage) => ({ id: passage.id, title: passage.title })),
        rows.flatMap((row) => row.numbers.map((item) => ({ number: item.number, questionId: row.id, passageId: row.passageId, answered: item.outcome === "correct", flagged: false }))),
        "Part"
      ),
    [sortedPassages, rows]
  );
  const currentGroup = groupsOfParts.find((group) => group.passageId === (section?.passage?.id ?? null)) ?? groupsOfParts[0];

  // ---- filters ---------------------------------------------------------------------------------------------------------------------------------
  const typesPresent = useMemo(
    () => QUESTION_TYPE_ORDER.filter((type) => rows.some((row) => row.type === type)).map((type) => ({ type, numbers: rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.span, 0) })),
    [rows]
  );
  const inType = useCallback((row: { type: QuestionType }) => typeFilter === "all" || row.type === typeFilter, [typeFilter]);
  const counts = useMemo(() => {
    const numbers = rows.filter(inType).flatMap((row) => row.numbers);
    return { all: numbers.length, wrong: numbers.filter((item) => numberMatchesStatus(item, "wrong")).length, unanswered: numbers.filter((item) => numberMatchesStatus(item, "unanswered")).length };
  }, [rows, inType]);
  const rowVisible = useCallback((row: (typeof rows)[number]) => inType(row) && row.numbers.some((item) => numberMatchesStatus(item, statusFilter)), [inType, statusFilter]);
  const visibleRows = useMemo(() => (section?.rows ?? []).filter(rowVisible), [section, rowVisible]);

  // A filter that leaves the part on screen empty moves to the first part that has something to show.
  useEffect(() => {
    if (visibleRows.length > 0) return;
    const next = sections.findIndex((candidate) => candidate.rows.some(rowVisible));
    if (next >= 0 && next !== sectionIndex) setSectionIndex(next);
  }, [visibleRows.length, sections, rowVisible, sectionIndex]);

  // ---- the numbers the student is looking at ---------------------------------------------------------------------------------------------------
  const firstNumber = rows[0]?.startNumber ?? 1;
  const [activeNumber, setActiveNumber] = useState(firstNumber);
  const rowOfNumber = useCallback((number: number) => rows.find((row) => number >= row.startNumber && number <= row.endNumber) ?? null, [rows]);

  /** question number -> where a teacher confirmed its answer is. */
  const evidenceByNumber = useMemo(() => {
    const map = new Map<number, { passageId: string; start: number; end: number }>();
    for (const row of rows) for (const item of row.evidence) map.set(evidenceNumberOf(row, item.slot), { passageId: item.passageId, start: item.start, end: item.end });
    return map;
  }, [rows]);

  const displayedPassage = useMemo(() => (leftOverride ? (sortedPassages.find((passage) => passage.id === leftOverride) ?? section?.passage) : section?.passage), [leftOverride, sortedPassages, section]);
  const passageEvidence: PassageEvidence[] = useMemo(() => {
    if (!displayedPassage) return [];
    return [...evidenceByNumber.entries()].filter(([, item]) => item.passageId === displayedPassage.id).map(([number, item]) => ({ number, start: item.start, end: item.end }));
  }, [evidenceByNumber, displayedPassage]);
  const activeEvidence = evidenceByNumber.has(activeNumber) ? activeNumber : null;

  const drawnPassageHighlights: readonly DrawnHighlight[] = useMemo(
    () => (displayedPassage ? passageHighlights.filter((highlight) => highlight.passageId === displayedPassage.id).map((highlight) => ({ id: highlight.id, start: highlight.start, end: highlight.end, note: highlight.note })) : EMPTY),
    [passageHighlights, displayedPassage]
  );

  /** The notes the student kept in the older notes drawer for this passage (one without a passage belongs to the first). */
  const passageNotes = useMemo(
    () => (displayedPassage ? props.notes.filter((note) => note.passageId === displayedPassage.id || (note.passageId == null && displayedPassage.id === sortedPassages[0]?.id)) : []),
    [props.notes, displayedPassage, sortedPassages]
  );

  const questionRanges = useMemo(() => {
    const map = new Map<string, DrawnHighlight[]>();
    for (const row of rows) {
      for (const highlight of row.highlights) {
        const region = questionRegion(highlight.questionId, highlight.region);
        map.set(region, [...(map.get(region) ?? []), { id: highlight.id, start: highlight.startOffset, end: highlight.endOffset, note: highlight.note }]);
      }
    }
    return map;
  }, [rows]);
  const noteById = useMemo(() => {
    const map = new Map<string, string>();
    for (const highlight of passageHighlights) if (highlight.note) map.set(highlight.id, highlight.note);
    for (const row of rows) for (const highlight of row.highlights) if (highlight.note) map.set(highlight.id, highlight.note);
    return map;
  }, [passageHighlights, rows]);

  const api: ReviewApi = useMemo(() => {
    const byRow = new Map<string, ReviewRowView>();
    for (const row of rows) byRow.set(row.id, { numbers: row.numbers, studentRaw: row.studentAnswer ?? null, correctRaw: row.correctAnswer, explanation: row.explanation });
    return { rows: byRow, popoverRoot: root, openPopover, setOpenPopover };
  }, [rows, root, openPopover]);
  const answers = useMemo(() => Object.fromEntries(rows.map((row) => [row.id, row.studentAnswer ?? undefined])), [rows]);

  // ---- moving around -----------------------------------------------------------------------------------------------------------------------------
  const goToNumber = useCallback(
    (number: number, how: { question: boolean; evidence: boolean }) => {
      const row = rowOfNumber(number);
      if (!row) return;
      setActiveNumber(number);
      setOpenPopover(null);
      // A number the filters have hidden (dimmed in the footer): going to it shows everything again, so there is something to go to.
      if (!rowVisible(row)) {
        setStatusFilter("all");
        setTypeFilter("all");
      }
      const target = sections.findIndex((candidate) => candidate.rows.includes(row));
      const needsSection = target >= 0 && target !== sectionIndex;
      if (needsSection) {
        setSectionIndex(target);
        setLeftOverride(null);
      }
      const evidence = evidenceByNumber.get(number);
      if (how.evidence && evidence) {
        const ownPassageId = (target >= 0 ? sections[target] : section)?.passage?.id;
        setLeftOverride(evidence.passageId !== ownPassageId ? evidence.passageId : null);
      }
      if (!isDesktop) setMobileTab(how.question || !(how.evidence && evidence) ? "right" : "left");
      setPending({ number, question: how.question, evidence: how.evidence && !!evidence, nonce: ++nonce.current });
    },
    [rowOfNumber, rowVisible, sections, sectionIndex, section, evidenceByNumber, isDesktop]
  );

  // After the screen has drawn the part (and the tab) that was asked for: scroll the question and / or the passage to the right place.
  useEffect(() => {
    if (!pending || !root) return;
    const handle = requestAnimationFrame(() => {
      const row = rowOfNumber(pending.number);
      if (pending.question && row) {
        const el = root.querySelector<HTMLElement>(`[data-question-id="${row.id}"]`);
        scrollPaneTo(el, "start");
        if (el) {
          el.setAttribute("data-flash", "true");
          window.setTimeout(() => el.removeAttribute("data-flash"), 1500);
        }
      }
      if (pending.evidence) scrollPaneTo(root.querySelector<HTMLElement>(`mark[data-ev-ids~="${pending.number}"]`), "center");
    });
    return () => cancelAnimationFrame(handle);
  }, [pending, root, rowOfNumber]);

  // The row of the active number gets a bar at its left edge (set on the element itself: the rows are the exam's own components and know nothing of it).
  useEffect(() => {
    if (!root) return;
    const active = rowOfNumber(activeNumber);
    for (const el of root.querySelectorAll<HTMLElement>("[data-question-row]")) {
      if (active && el.dataset.questionId === active.id) el.setAttribute("data-active", "true");
      else el.removeAttribute("data-active");
    }
  }, [root, activeNumber, rowOfNumber, visibleRows]);

  const selectFooterNumber = useCallback((item: ReviewFooterNumber) => goToNumber(item.number, { question: true, evidence: true }), [goToNumber]);
  const selectPart = useCallback(
    (group: PassageGroup) => {
      const index = sections.findIndex((candidate) => (candidate.passage?.id ?? null) === group.passageId);
      if (index < 0) return;
      setSectionIndex(index);
      setLeftOverride(null);
      setActiveNumber(group.firstNumber);
      setOpenPopover(null);
      setPending({ number: group.firstNumber, question: false, evidence: false, nonce: ++nonce.current });
      for (const pane of root?.querySelectorAll<HTMLElement>(".ex-pane") ?? []) pane.scrollTo({ top: 0 });
    },
    [sections, root]
  );
  const step = useCallback(
    (delta: 1 | -1) => {
      const next = adjacentNumber(groupsOfParts, activeNumber, delta);
      if (next) goToNumber(next.number, { question: true, evidence: true });
    },
    [groupsOfParts, activeNumber, goToNumber]
  );

  /** A click inside the questions: the passage scrolls to the evidence of the number that was clicked (or of the row's first number that has any). */
  function onQuestionsClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".ex-rv-button, .ex-pop, .ex-note-marker, a")) return;
    const rowEl = target.closest<HTMLElement>("[data-question-row]");
    const row = rowEl?.dataset.questionId ? rowById.get(rowEl.dataset.questionId) : null;
    if (!row) return;
    const marked = target.closest<HTMLElement>("[data-number], [data-question-number]") ?? target.closest<HTMLElement>(".ex-match-row")?.querySelector<HTMLElement>("[data-number]") ?? null;
    const clicked = Number(marked?.dataset.number ?? marked?.dataset.questionNumber);
    const number = Number.isInteger(clicked) && clicked >= row.startNumber && clicked <= row.endNumber ? clicked : (row.numbers.map((item) => item.number).find((n) => evidenceByNumber.has(n)) ?? row.startNumber);
    goToNumber(number, { question: false, evidence: true });
  }

  // A note marker ("this highlight has a note"): press it to read the note; read-only.
  useEffect(() => {
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const marker = target?.closest<HTMLElement>("button[data-note-for]");
      if (!marker) {
        if (!target?.closest(".ex-note-view")) setNoteView(null);
        return;
      }
      const text = noteById.get(marker.dataset.noteFor ?? "");
      if (!text) return;
      const rect = marker.getBoundingClientRect();
      setNoteView((current) => (current?.text === text && Math.abs(current.left - rect.left) < 2 ? null : { text, left: Math.max(8, Math.min(rect.left, window.innerWidth - 8 - 340)), top: rect.bottom + 6 }));
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNoteView(null);
    };
    root.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [root, noteById]);

  // ---- what the footer and the bars show ---------------------------------------------------------------------------------------------------------
  const parts: ReviewFooterPart[] = useMemo(
    () =>
      groupsOfParts.map((group) => {
        const numbers: ReviewFooterNumber[] = group.numbers.map((item) => {
          const row = rowOfNumber(item.number);
          const result = row?.numbers.find((n) => n.number === item.number);
          const shown = !!row && !!result && inType(row) && numberMatchesStatus(result, statusFilter);
          return { number: item.number, questionId: item.questionId, outcome: result?.outcome ?? "skipped", dimmed: !shown };
        });
        return { group, numbers, correct: numbers.filter((n) => n.outcome === "correct").length };
      }),
    [groupsOfParts, rowOfNumber, inType, statusFilter]
  );
  const partCorrect = parts.find((part) => part.group.key === currentGroup?.key)?.correct ?? 0;

  const dialogNumbers = useMemo(() => rows.flatMap((row) => row.numbers), [rows]);
  const bandText = band != null ? band.toFixed(1) : "—";
  const hasLeft = testType === "READING" || sortedPassages.some((passage) => passage.content.trim().length > 0);
  const audioSrc = testType === "LISTENING" ? (displayedPassage?.audioUrl ?? null) : null;
  const sideLabel = testType === "LISTENING" ? "Transcript" : "Passage";

  const partLabel = currentGroup ? partLabelOf(currentGroup) : null;
  const partRange = currentGroup ? formatNumberRange(currentGroup.firstNumber, currentGroup.lastNumber) : null;

  const leftPane = displayedPassage ? (
    displayedPassage.content.trim().length > 0 ? (
      <OfficialPassage
        key={displayedPassage.id}
        passageId={displayedPassage.id}
        title={testType === "LISTENING" ? displayedPassage.title || "Transcript" : displayedPassage.title}
        content={displayedPassage.content}
        attachments={displayedPassage.attachments}
        highlights={drawnPassageHighlights}
        evidence={passageEvidence}
        activeEvidence={activeEvidence}
        onEvidenceBadge={(number) => goToNumber(number, { question: true, evidence: false })}
        plain={testType === "LISTENING"}
        after={
          passageNotes.length > 0 ? (
            <section className="ex-notes" data-testid="review-notes" aria-label="Your notes">
              <h3>Your notes</h3>
              <ul>
                {passageNotes.map((note) => (
                  <li key={note.id}>{note.content}</li>
                ))}
              </ul>
            </section>
          ) : null
        }
      />
    ) : (
      <div className="ex-pane">
        <p>There is no {sideLabel.toLowerCase()} for this part.</p>
      </div>
    )
  ) : (
    <div className="ex-pane">
      <p>This test has no {sideLabel.toLowerCase()}.</p>
    </div>
  );

  const rightPane = (
    <ReviewContext.Provider value={api}>
      <OfficialRangesContext.Provider value={questionRanges}>
        <div key={section?.passage?.id ?? "questions"} className="ex-pane" data-testid="review-questions">
          <div className="ex-questions" onClick={onQuestionsClick}>
            {visibleRows.length === 0 ? (
              <p data-testid="review-empty">{statusFilter === "wrong" ? "No wrong answers here - well done." : statusFilter === "unanswered" ? "Every question here was answered." : "No questions of this type."}</p>
            ) : (
              <OfficialQuestionGroups rows={visibleRows} groups={groups} answers={answers} onAnswer={noop} />
            )}
          </div>
        </div>
      </OfficialRangesContext.Provider>
    </ReviewContext.Provider>
  );

  return (
    <div ref={setRoot} className="official-exam ex-reviewing" data-contrast={preferences.contrast} data-text-size={preferences.textSize} data-testid="official-review" style={{ fontSize: `${textSizePx(preferences.textSize)}px` }}>
      <OfficialHeader
        candidateName={props.candidateName}
        center={
          <span className="ex-band" data-testid="review-band">
            <span className="ex-rv-long">Band score: </span>
            <span className="ex-rv-short">Band </span>
            {bandText}
          </span>
        }
        endExtra={
          <>
            <button type="button" className="ex-text-button" onClick={() => setDialogOpen(true)} data-testid="open-results">
              Results
            </button>
            <Link href={props.exitHref} className="ex-text-button" data-testid="review-exit">
              <span className="ex-rv-long">Finish review</span>
              <span className="ex-rv-short">Exit</span>
            </Link>
          </>
        }
        preferences={preferences}
        onPreferencesChange={changePreferences}
      />

      <div className="ex-partbar ex-review-bar" data-testid="part-bar">
        <span>
          {partLabel && <strong>{partLabel}</strong>}
          {partRange && (
            <>
              Questions {partRange} - {partCorrect} of {currentGroup?.total ?? 0} correct
            </>
          )}
        </span>
        <div className="ex-filters" role="group" aria-label="Show these questions" data-testid="review-filters">
          {(["all", "wrong", "unanswered"] as const).map((value) => (
            <button key={value} type="button" className="ex-chip" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)} data-testid={`review-filter-${value}`}>
              {value === "all" ? "All" : value === "wrong" ? "Wrong" : "Unanswered"} {counts[value]}
            </button>
          ))}
          {typesPresent.length > 1 && (
            <select className="ex-chip-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as QuestionType | "all")} aria-label="Show one question type" data-testid="review-type-filter">
              <option value="all">All question types</option>
              {typesPresent.map(({ type, numbers }) => (
                <option key={type} value={type}>
                  {QUESTION_TYPE_META[type].label} ({numbers})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {audioSrc && (
        <div className="ex-audio-bar" data-testid="review-audio">
          <ReviewAudioPlayer src={audioSrc} label={displayedPassage?.title ?? "Listening audio"} />
        </div>
      )}

      <main className="ex-main" aria-label={`${testType === "LISTENING" ? "Listening" : "Reading"} review`} style={isDesktop ? undefined : { flexDirection: "column" }}>
        {!hasLeft ? (
          rightPane
        ) : isDesktop ? (
          <OfficialSplit left={leftPane} right={rightPane} leftLabel={sideLabel} />
        ) : (
          <>
            <div className="ex-tabs" role="tablist" aria-label={`${sideLabel} or questions`}>
              <button type="button" role="tab" className="ex-tab" aria-selected={mobileTab === "left"} onClick={() => setMobileTab("left")}>
                {sideLabel}
              </button>
              <button type="button" role="tab" className="ex-tab" aria-selected={mobileTab === "right"} onClick={() => setMobileTab("right")}>
                Questions
              </button>
            </div>
            <div className="ex-phone-pane" hidden={mobileTab !== "left"}>
              {leftPane}
            </div>
            <div className="ex-phone-pane" hidden={mobileTab !== "right"}>
              {rightPane}
            </div>
          </>
        )}
      </main>

      <OfficialReviewFooter
        parts={parts}
        openGroupKey={currentGroup?.key ?? ""}
        activeNumber={activeNumber}
        onSelectNumber={selectFooterNumber}
        onSelectPart={selectPart}
        onPrevious={() => step(-1)}
        onNext={() => step(1)}
        hasPrevious={adjacentNumber(groupsOfParts, activeNumber, -1) !== null}
        hasNext={adjacentNumber(groupsOfParts, activeNumber, 1) !== null}
      />

      <OfficialReviewDialog open={dialogOpen} onOpenChange={changeDialog} container={root} band={band} rawScore={rawScore} totalPoints={totalPoints} numbers={dialogNumbers} detailsHref={`/student/exam/attempt/${props.resultId}/results`} />

      {noteView && (
        <div className="ex-note-view" style={{ left: noteView.left, top: noteView.top }} role="note" data-testid="note-view">
          <small>Your note</small>
          {noteView.text}
        </div>
      )}
    </div>
  );
}
