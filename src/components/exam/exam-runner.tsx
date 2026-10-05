"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import type { HighlightColor, QuestionType } from "@prisma/client";
import { ClipboardList, Home, List, Loader2, Maximize2, Minimize2, NotebookPen } from "lucide-react";
import { toast } from "sonner";

import {
  deleteNoteAction,
  markListeningAudioEndedAction,
  saveAnswerAction,
  saveNoteAction,
  submitAttemptAction,
  toggleFlagAction,
  updateLastSeenQuestionAction,
} from "@/actions/exam.actions";
import { toggleQuestionBookmarkAction } from "@/actions/bookmarks.actions";
import { cn } from "@/lib/utils";
import { FULL_MOCK_LISTENING_TRANSFER_MINUTES } from "@/lib/full-mock-constants";
import { numberQuestions, slotAnswered, summarizeSlotAnswer, type NumberedQuestion } from "@/lib/exam/question-numbering";
import { adjacentNumber, buildPassageGroups, groupIndexOfNumber, type NavNumber, type PassageGroup } from "@/lib/exam/passage-groups";
import { passageRegion, questionRegion, reanchorHighlight, type HighlightRange } from "@/lib/exam/text-highlight";
import type { QuestionGroupInfo } from "@/lib/exam/question-groups";
import type { ExamUiMode } from "@/lib/exam/ui-mode";
import { DEFAULT_EXAM_PREFERENCES, examPreferencesCookieName, type ExamPreferences } from "@/lib/exam/ui-preferences";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExamTimer } from "@/components/exam/exam-timer";
import { QuestionNavigator, type NavigatorQuestionState } from "@/components/exam/question-navigator";
import { YourAnswersPanel, type AnswerSummaryQuestion } from "@/components/exam/your-answers-panel";
import { ListeningPartNav, type ListeningPart } from "@/components/exam/listening-part-nav";
import { SubmitConfirmationDialog } from "@/components/exam/submit-confirmation-dialog";
import { ReviewCenter } from "@/components/exam/review-center";
import { LeaveTestDialog } from "@/components/exam/leave-test-dialog";
import { PassagePanel } from "@/components/exam/passage-panel";
import { PassageNavBar } from "@/components/exam/passage-nav-bar";
import { QuestionBlock } from "@/components/exam/question-block";
import { ResizableSplit } from "@/components/exam/resizable-split";
import { NotesDrawer, type ExamNote } from "@/components/exam/notes-drawer";
import { AudioPlayer } from "@/components/exam/audio-player";
import { PassageAttachments, type ExamAttachment } from "@/components/exam/passage-attachments";
import { MobileSplitTabs } from "@/components/exam/mobile-split-tabs";
import { useMediaQuery } from "@/components/exam/use-media-query";
import { useStableValue } from "@/components/exam/use-stable-value";
import { HighlightSurface } from "@/components/exam/highlight/highlight-surface";
import { QuestionHighlightProvider } from "@/components/exam/highlight/question-highlight-context";
import { useExamHighlights, type StoredHighlight } from "@/components/exam/highlight/use-exam-highlights";
import { OfficialReadingExam } from "@/components/exam/official/official-reading-exam";
import { OfficialListeningExam } from "@/components/exam/official/official-listening-exam";

export type ExamQuestion = {
  id: string;
  passageId: string | null;
  /** Phase G — the teacher-side question group this row belongs to (its instructions head the group on the official screen). */
  groupId?: string | null;
  type: QuestionType;
  prompt: string;
  options: unknown;
  orderIndex: number;
  /** A summary row's answer KEYS (never the answers), so every number gets an answer box even when the text marks fewer blanks than the row claims. */
  blankKeys?: string[] | null;
};

export type ExamPassage = {
  id: string;
  title: string;
  content: string;
  audioUrl: string | null;
  orderIndex: number;
  attachments: ExamAttachment[];
};

export type ExamHighlight = { id: string; passageId: string; text: string; startOffset: number; endOffset: number; color: HighlightColor; note?: string | null };
export type ExamQuestionHighlight = { id: string; questionId: string; region: string; text: string; startOffset: number; endOffset: number; note?: string | null };
export type ExamNoteRecord = { id: string; passageId: string | null; content: string };

type NumberedExamQuestion = NumberedQuestion<ExamQuestion>;
type ExamSection = { passage: ExamPassage | undefined; questions: NumberedExamQuestion[] };

/** Typing is saved this long after the last keystroke — and immediately when the test is submitted or time runs out. */
const SAVE_DEBOUNCE_MS = 450;
const EMPTY_RANGES: readonly HighlightRange[] = [];
const FOCUSABLE_ANSWER_CONTROL = 'input:not([type="hidden"]), textarea, [role="combobox"], [role="radio"], [role="checkbox"]';

/**
 * Phase 46 (CBT Listening) — the exam-taking LEFT panel: a real "Sticky
 * audio area" (section label + audio player never scroll away, only the
 * attachments beneath them do) plus an honest empty state when a section
 * genuinely has no audio, instead of silently rendering nothing. Shared by
 * both the desktop resizable split and the mobile tab, so the two can never
 * drift out of sync.
 */
function ListeningLeftPanel({
  passage,
  sectionLabel,
  onAudioEnded,
}: {
  passage: ExamPassage;
  sectionLabel: string | undefined;
  onAudioEnded?: (src: string) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border/70 bg-background/95 shrink-0 border-b px-5 py-4 backdrop-blur-sm">
        {sectionLabel && <p className="text-muted-foreground mb-0.5 text-[11px] font-medium tracking-wide uppercase">{sectionLabel}</p>}
        <h2 className="font-display truncate text-base font-medium sm:text-lg">{passage.title}</h2>
      </div>
      <div className="shrink-0 px-5 pt-4">
        {passage.audioUrl ? (
          <AudioPlayer src={passage.audioUrl} label={passage.title} onEnded={onAudioEnded} />
        ) : (
          <div className="border-border/70 bg-secondary/30 text-muted-foreground rounded-2xl border border-dashed px-4 py-6 text-center text-sm">
            Audio isn&apos;t available for this section yet.
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <PassageAttachments attachments={passage.attachments} />
      </div>
    </div>
  );
}

export function ExamRunner({
  resultId,
  testTitle,
  testType,
  initialRemainingSeconds,
  fullMock = null,
  passages,
  questions,
  initialAnswers,
  initialFlags,
  initialBookmarks,
  initialHighlights,
  initialQuestionHighlights = [],
  initialNotes,
  initialLastSeenQuestionId,
  ui = "legacy",
  candidateName = "",
  groups = [],
  preferenceKey = "",
  initialPreferences = DEFAULT_EXAM_PREFERENCES,
  listeningElapsedSeconds = 0,
  listeningTimed = false,
}: {
  resultId: string;
  testTitle: string;
  testType: "READING" | "LISTENING";
  /** Seconds left when the page was rendered (null = untimed) — computed once on the server so the server render and hydration agree. */
  initialRemainingSeconds: number | null;
  /** Set when this paper is a leg of a running Full Mock: the Listening recording ending starts the 2-minute transfer time (`transferSecondsRemaining` is already running if the page was reloaded during it). */
  fullMock?: { attemptId: string; transferSecondsRemaining: number | null } | null;
  passages: ExamPassage[];
  questions: ExamQuestion[];
  initialAnswers: Record<string, unknown>;
  initialFlags: string[];
  initialBookmarks: string[];
  initialHighlights: ExamHighlight[];
  initialQuestionHighlights?: ExamQuestionHighlight[];
  initialNotes: ExamNoteRecord[];
  initialLastSeenQuestionId: string | null;
  /** Phase G — which Reading screen to draw. "official" is the computer-delivered look; "legacy" (the default here) is the screen from before Phase G. Listening always uses the legacy layout. */
  ui?: ExamUiMode;
  candidateName?: string;
  /** The teacher-side question groups (instructions) of this test; only the official screen uses them. */
  groups?: QuestionGroupInfo[];
  /** The student's profile id — names the cookie that remembers their contrast / text-size choice. */
  preferenceKey?: string;
  initialPreferences?: ExamPreferences;
  /** Phase I (official Listening) - seconds since "Start test" when the server rendered the page, by the SERVER's clock: where the recording is. */
  listeningElapsedSeconds?: number;
  /** Phase I - the test has a clock (a duration, or a Full Mock section): it is handed in by itself 2 minutes after the recording. An untimed test never is. */
  listeningTimed?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const latestAnswers = useRef<Record<string, unknown>>(initialAnswers);
  const [flags, setFlags] = useState<Set<string>>(() => new Set(initialFlags));
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => new Set(initialBookmarks));
  const [notes, setNotes] = useState<ExamNoteRecord[]>(initialNotes);

  const sortedPassages = useMemo(() => [...passages].sort((a, b) => a.orderIndex - b.orderIndex), [passages]);
  const sortedQuestions = useMemo(() => [...questions].sort((a, b) => a.orderIndex - b.orderIndex), [questions]);

  // Phase A — a Question ROW is not always one numbered question (a matching task covering 22–26 is one row, five numbers), so everything the student sees — the navigator, the "x of 40", the answered tally — counts NUMBERS, via the same helper the importer/teacher side uses. Counting rows here is what made a 40-question test show as 26.
  const numberedQuestions = useMemo(() => numberQuestions(sortedQuestions), [sortedQuestions]);
  const numberedById = useMemo(() => new Map(numberedQuestions.map((question) => [question.id, question])), [numberedQuestions]);
  const totalQuestionCount = numberedQuestions.length > 0 ? numberedQuestions[numberedQuestions.length - 1].endNumber : 0;

  // The question rows shown with each passage / part. A row that belongs to no passage (or to one that no longer exists) is shown with the LAST section instead of nowhere — a question the student can't see is a question they can't answer.
  const sections: ExamSection[] = useMemo(() => {
    if (sortedPassages.length === 0) return [{ passage: undefined, questions: numberedQuestions }];
    const indexById = new Map(sortedPassages.map((passage, index) => [passage.id, index]));
    const last = sortedPassages.length - 1;
    const built: ExamSection[] = sortedPassages.map((passage) => ({ passage, questions: [] }));
    for (const question of numberedQuestions) {
      const index = question.passageId != null ? (indexById.get(question.passageId) ?? last) : last;
      built[index].questions.push(question);
    }
    return built;
  }, [sortedPassages, numberedQuestions]);
  const sectionIndexByQuestionId = useMemo(() => {
    const map = new Map<string, number>();
    sections.forEach((section, index) => section.questions.forEach((question) => map.set(question.id, index)));
    return map;
  }, [sections]);

  // Where the student is. `activeNumber` is the IELTS question number they are on (it follows what they click, type into or jump to); the visible passage is the one that number belongs to. The server remembers the question across refreshes and devices (Result.lastSeenQuestionId); the older localStorage section memory below only serves attempts that predate it.
  const [activeNumber, setActiveNumber] = useState<number>(() => {
    const row = initialLastSeenQuestionId ? numberedById.get(initialLastSeenQuestionId) : undefined;
    return row?.startNumber ?? 1;
  });
  const [sectionIndex, setSectionIndex] = useState<number>(() => {
    const row = initialLastSeenQuestionId ? numberedById.get(initialLastSeenQuestionId) : undefined;
    return row ? (sectionIndexByQuestionId.get(row.id) ?? 0) : 0;
  });
  const [mobileTab, setMobileTab] = useState<"left" | "right">("left");

  useEffect(() => {
    if (initialLastSeenQuestionId && numberedById.has(initialLastSeenQuestionId)) return;
    try {
      const saved = Number(window.localStorage.getItem(`exam-section-${resultId}`));
      if (Number.isInteger(saved) && saved > 0 && saved < sections.length) {
        setSectionIndex(saved);
        const first = sections[saved].questions[0];
        if (first) setActiveNumber(first.startNumber);
      }
    } catch {
      // Private browsing / storage disabled — just starts from the first section.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore; everything it reads is stable for this component's lifetime
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(`exam-section-${resultId}`, String(sectionIndex));
    } catch {
      // Private browsing / storage disabled — position just won't be remembered, no functional loss.
    }
  }, [resultId, sectionIndex]);

  const [navOpen, setNavOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [submitting, startSubmitTransition] = useTransition();
  const [pendingSaves, setPendingSaves] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const examContainerRef = useRef<HTMLDivElement>(null);
  const questionsPanelRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ---- highlights: one store for the passage AND the question panel -----------------------------------------------
  const [initialStoredHighlights] = useState<StoredHighlight[]>(() => {
    const contentById = new Map(passages.map((passage) => [passage.id, passage.content]));
    const stored: StoredHighlight[] = [];
    for (const highlight of initialHighlights) {
      const content = contentById.get(highlight.passageId);
      if (content == null) continue;
      // Highlights saved by the old engine were shifted by the paragraph labels — put them back on the words they were made on.
      const range = reanchorHighlight(content, highlight);
      if (!range) continue;
      stored.push({ id: highlight.id, region: passageRegion(highlight.passageId), start: range.start, end: range.end, text: content.slice(range.start, range.end), note: highlight.note ?? null });
    }
    for (const highlight of initialQuestionHighlights) {
      stored.push({ id: highlight.id, region: questionRegion(highlight.questionId, highlight.region), start: highlight.startOffset, end: highlight.endOffset, text: highlight.text, note: highlight.note ?? null });
    }
    return stored;
  });
  const highlightStore = useExamHighlights(resultId, initialStoredHighlights);
  const flushHighlights = highlightStore.flush;

  // ---- derived navigation data --------------------------------------------------------------------------------------
  const currentSection: ExamSection = sections[Math.min(sectionIndex, sections.length - 1)] ?? { passage: undefined, questions: [] };
  const currentPassage = currentSection.passage;
  const currentQuestions = currentSection.questions;

  // Which numbers are answered only changes when a box becomes empty/non-empty, not on every keystroke — keep the same array until it really changes, so the navigation bars below don't re-render for every key pressed.
  const answeredFlags = useMemo(() => numberedQuestions.map((question) => slotAnswered(question, answers[question.id])), [numberedQuestions, answers]);
  const stableAnsweredFlags = useStableValue(answeredFlags, (previous, next) => previous.length === next.length && previous.every((row, i) => row.length === next[i].length && row.every((flag, j) => flag === next[i][j])));

  const navigatorItems: NavigatorQuestionState[] = useMemo(
    () =>
      numberedQuestions.flatMap((question, rowIndex) =>
        stableAnsweredFlags[rowIndex].map((answered, slotIndex) => ({
          id: `${question.id}:${slotIndex}`,
          questionId: question.id,
          number: question.startNumber + slotIndex,
          answered,
          flagged: flags.has(question.id),
        }))
      ),
    [numberedQuestions, stableAnsweredFlags, flags]
  );

  const answerSummaryQuestions: AnswerSummaryQuestion[] = useMemo(
    () =>
      numberedQuestions.flatMap((question) =>
        question.slotKeys.map((_, slotIndex) => ({
          id: `${question.id}:${slotIndex}`,
          questionId: question.id,
          number: question.startNumber + slotIndex,
          summary: summarizeSlotAnswer(question, answers[question.id], slotIndex),
        }))
      ),
    [numberedQuestions, answers]
  );

  const passageGroups: PassageGroup[] = useMemo(
    () =>
      buildPassageGroups(
        sortedPassages,
        navigatorItems.map((item) => ({ number: item.number, questionId: item.questionId, answered: item.answered, flagged: item.flagged, passageId: numberedById.get(item.questionId)?.passageId ?? null }))
      ),
    [sortedPassages, navigatorItems, numberedById]
  );

  const answeredCount = navigatorItems.filter((item) => item.answered).length;
  const flaggedCount = navigatorItems.filter((item) => item.flagged).length;
  const completionPercent = totalQuestionCount > 0 ? Math.round((answeredCount / totalQuestionCount) * 100) : 0;

  const activeRow = numberedQuestions.find((question) => activeNumber >= question.startNumber && activeNumber <= question.endNumber) ?? currentQuestions[0] ?? numberedQuestions[0];
  const effectiveActiveNumber = activeRow ? Math.min(Math.max(activeNumber, activeRow.startNumber), activeRow.endNumber) : activeNumber;
  const effectiveActiveQuestionId = activeRow?.id ?? "";
  const activeGroupIndex = groupIndexOfNumber(passageGroups, effectiveActiveNumber);
  const activeGroupKey = passageGroups[activeGroupIndex]?.key ?? passageGroups[0]?.key ?? "";

  const activeSectionLabel = testType === "LISTENING" ? currentPassage?.title || `Part ${sectionIndex + 1}` : `Passage ${sectionIndex + 1}`;
  // Phase 48 — the CBT passage panel's sticky-header "section information", omitted for single-passage Reading tests (nothing to disambiguate).
  const readingSectionLabel = sortedPassages.length > 1 ? `Passage ${sectionIndex + 1} of ${sortedPassages.length}` : undefined;
  // Phase 46 (CBT Listening) — same real "section information" concept for the sticky audio-area header.
  const listeningSectionLabel = sortedPassages.length > 1 ? `Part ${sectionIndex + 1} of ${sortedPassages.length}` : undefined;

  const listeningParts: ListeningPart[] = useMemo(
    () =>
      sections.map((section, index) => {
        const ids = new Set(section.questions.map((question) => question.id));
        const partItems = navigatorItems.filter((item) => ids.has(item.questionId));
        return {
          id: section.passage?.id ?? `section-${index}`,
          index,
          title: section.passage?.title || `Part ${index + 1}`,
          questionCount: partItems.length,
          answeredCount: partItems.filter((item) => item.answered).length,
        };
      }),
    [sections, navigatorItems]
  );

  // ---- saving answers -----------------------------------------------------------------------------------------------
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const saveChains = useRef<Map<string, Promise<unknown>>>(new Map());
  const lastSaveErrorAt = useRef(0);
  /** Phase K - set below: what to do when the server says this attempt is already over (its time ran out, or a teacher ended it). */
  const onAttemptEnded = useRef<(() => void) | null>(null);

  /** Sends the latest value of one question now. Saves of the same question go out strictly in order, so a slow earlier save can never overwrite a newer one. */
  const sendSave = useCallback(
    (questionId: string): Promise<unknown> => {
      const timer = saveTimers.current.get(questionId);
      if (timer) clearTimeout(timer);
      const hadPending = saveTimers.current.delete(questionId);
      const value = latestAnswers.current[questionId];
      const previous = saveChains.current.get(questionId) ?? Promise.resolve();
      const next = previous
        .then(() => saveAnswerAction(resultId, questionId, value as never))
        .then((result) => {
          if (!result.success && result.ended) {
            onAttemptEnded.current?.();
            return;
          }
          if (!result.success && Date.now() - lastSaveErrorAt.current > 8000) {
            lastSaveErrorAt.current = Date.now();
            toast.error(`Your last answer couldn't be saved: ${result.error}`);
          }
        })
        .catch(() => {
          if (Date.now() - lastSaveErrorAt.current > 8000) {
            lastSaveErrorAt.current = Date.now();
            toast.error("Your last answer couldn't be saved. Check your connection.");
          }
        })
        .finally(() => {
          if (hadPending) setPendingSaves((count) => Math.max(0, count - 1));
        });
      saveChains.current.set(questionId, next);
      return next;
    },
    [resultId]
  );

  const handleAnswerChange = useCallback(
    (questionId: string, value: unknown) => {
      latestAnswers.current = { ...latestAnswers.current, [questionId]: value };
      setAnswers(latestAnswers.current);

      const existing = saveTimers.current.get(questionId);
      if (existing) clearTimeout(existing);
      else setPendingSaves((count) => count + 1); // counted once per question with unsaved changes
      saveTimers.current.set(
        questionId,
        setTimeout(() => void sendSave(questionId), SAVE_DEBOUNCE_MS)
      );
    },
    [sendSave]
  );

  /** Everything typed or highlighted so far is on the server before the test is graded — the grader only sees saved answers. */
  const flushPendingWork = useCallback(async () => {
    try {
      await Promise.all([...saveTimers.current.keys()].map((questionId) => sendSave(questionId)));
      await Promise.all([...saveChains.current.values()]);
      await flushHighlights();
    } catch {
      // Whatever could be saved has been; submitting must still go ahead.
    }
  }, [sendSave, flushHighlights]);

  const handleToggleFlag = useCallback(
    (questionId: string) => {
      setFlags((prev) => {
        const next = new Set(prev);
        if (next.has(questionId)) next.delete(questionId);
        else next.add(questionId);
        return next;
      });
      void toggleFlagAction(resultId, questionId);
    },
    [resultId]
  );

  const handleToggleBookmark = useCallback((questionId: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    void toggleQuestionBookmarkAction(questionId);
  }, []);

  // ---- navigation ---------------------------------------------------------------------------------------------------
  const lastSeenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedQuestion = useRef<string | null>(initialLastSeenQuestionId);

  /** Phase 41 — debounced real persistence of "where the student currently is", so a refresh (or a different device) resumes at the exact question, not just the section. */
  const persistLastSeenQuestion = useCallback(
    (questionId: string) => {
      if (lastPersistedQuestion.current === questionId) return;
      if (lastSeenTimer.current) clearTimeout(lastSeenTimer.current);
      lastSeenTimer.current = setTimeout(() => {
        lastPersistedQuestion.current = questionId;
        void updateLastSeenQuestionAction(resultId, questionId);
      }, 800);
    },
    [resultId]
  );

  // A jump is "switch section → wait for it to render → scroll to the question → focus its answer box". Doing the last two in an effect (not straight after setState) is what makes it work when the target is on another passage or another phone tab.
  const pendingJump = useRef<{ questionId: string; number: number } | null>(null);
  const [jumpTick, setJumpTick] = useState(0);

  const goToQuestion = useCallback(
    (questionId: string, number?: number) => {
      const row = numberedById.get(questionId);
      if (!row) return;
      const target = number ?? row.startNumber;
      setSectionIndex(sectionIndexByQuestionId.get(questionId) ?? 0);
      setActiveNumber(target);
      persistLastSeenQuestion(questionId);
      setNavOpen(false);
      setReviewOpen(false);
      setMobileTab("right");
      pendingJump.current = { questionId, number: target };
      setJumpTick((tick) => tick + 1);
    },
    [numberedById, sectionIndexByQuestionId, persistLastSeenQuestion]
  );

  useEffect(() => {
    const job = pendingJump.current;
    if (!job) return;
    pendingJump.current = null;
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(`question-${job.questionId}`);
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      // On a phone, focusing a text box would throw the keyboard up over the page the student just navigated to.
      if (window.matchMedia("(pointer: coarse)").matches) return;
      const control = row.querySelector<HTMLElement>(`[data-question-number="${job.number}"]`) ?? row.querySelector<HTMLElement>(FOCUSABLE_ANSWER_CONTROL);
      control?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpTick]);

  /** Section-level navigation (a passage label, Listening's part tabs) lands on that section's first question. */
  const goToSection = useCallback(
    (index: number) => {
      const section = sections[index];
      if (!section) return;
      setSectionIndex(index);
      const first = section.questions[0];
      if (first) {
        setActiveNumber(first.startNumber);
        persistLastSeenQuestion(first.id);
      }
      setMobileTab("left");
    },
    [sections, persistLastSeenQuestion]
  );

  const handleSelectNavNumber = useCallback((item: NavNumber) => goToQuestion(item.questionId, item.number), [goToQuestion]);

  const handleSelectPassage = useCallback(
    (group: PassageGroup) => {
      const index = sections.findIndex((section) => section.passage?.id === group.passageId);
      goToSection(index >= 0 ? index : 0);
    },
    [sections, goToSection]
  );

  const stepQuestion = useCallback(
    (delta: 1 | -1) => {
      const target = adjacentNumber(passageGroups, effectiveActiveNumber, delta);
      if (target) goToQuestion(target.questionId, target.number);
    },
    [passageGroups, effectiveActiveNumber, goToQuestion]
  );
  const goToPrevious = useCallback(() => stepQuestion(-1), [stepQuestion]);
  const goToNext = useCallback(() => stepQuestion(1), [stepQuestion]);

  /** The student's real position follows what they touch: clicking into or tabbing to an answer box makes that number current, so the navigation bar always shows where they actually are. */
  const handlePanelInteraction = useCallback(
    (event: SyntheticEvent) => {
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLElement>("[data-question-row]");
      if (!row) return;
      const number = Number(target.closest<HTMLElement>("[data-question-number]")?.dataset.questionNumber ?? row.dataset.startNumber);
      if (!Number.isFinite(number)) return;
      setActiveNumber((previous) => (previous === number ? previous : number));
      if (row.dataset.questionId) persistLastSeenQuestion(row.dataset.questionId);
    },
    [persistLastSeenQuestion]
  );

  /** Enter / ↓ move to the next answer box, ↑ (or Shift+Enter) to the previous — across the end of a passage they carry on into the next one. */
  const handleAnswerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      if (!(target instanceof HTMLInputElement) || !target.hasAttribute("data-answer-box")) return;
      if (event.nativeEvent.isComposing) return;
      let delta: 1 | -1;
      if (event.key === "Enter") delta = event.shiftKey ? -1 : 1;
      else if (event.key === "ArrowDown") delta = 1;
      else if (event.key === "ArrowUp") delta = -1;
      else return;
      event.preventDefault();

      const boxes = [...(questionsPanelRef.current?.querySelectorAll<HTMLInputElement>("input[data-answer-box]") ?? [])];
      const next = boxes[boxes.indexOf(target) + delta];
      if (next) {
        next.scrollIntoView({ behavior: "smooth", block: "center" });
        next.focus({ preventScroll: true });
        return;
      }
      // Past the first/last box of this passage: continue into the neighbouring one.
      const neighbour = sections[sectionIndex + delta]?.questions;
      const row = delta === 1 ? neighbour?.[0] : neighbour?.[neighbour.length - 1];
      if (row) goToQuestion(row.id, delta === 1 ? row.startNumber : row.endNumber);
    },
    [sections, sectionIndex, goToQuestion]
  );

  /** Phase 41 — Part 11's keyboard shortcuts: Left/Right jump to the previous/next question in real test order. Only fires when nothing is specifically focused (no active input, textarea, radio, or combobox), so it never hijacks native arrow-key behavior inside an answer control. */
  useEffect(() => {
    function handleKeydown(event: globalThis.KeyboardEvent) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (document.activeElement && document.activeElement !== document.body) return;
      // Phase H: Shift+arrows (and every other combination) belong to the text selection / the browser, and while text is selected the arrows move that selection - they never step to another question.
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (window.getSelection()?.isCollapsed === false) return;
      event.preventDefault();
      stepQuestion(event.key === "ArrowRight" ? 1 : -1);
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [stepQuestion]);

  // Listening: auto-focus the first answer box of a part the moment it loads (new part navigation, or the very first part on load) — a real IELTS Listening habit, since audio starts before the student has clicked anything.
  useEffect(() => {
    if (testType !== "LISTENING") return;
    const firstQuestion = currentQuestions[0];
    if (!firstQuestion) return;
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(`question-${firstQuestion.id}`);
      row?.querySelector<HTMLElement>(FOCUSABLE_ANSWER_CONTROL)?.focus();
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately re-runs only when the part itself changes (sectionIndex), reading currentQuestions fresh via closure each time
  }, [testType, sectionIndex]);

  async function toggleFocusMode() {
    const next = !focusMode;
    setFocusMode(next);
    try {
      if (next) await examContainerRef.current?.requestFullscreen?.();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Fullscreen is a best-effort enhancement — hiding the side panel below still works even if the browser refuses it.
    }
  }

  // ---- notes --------------------------------------------------------------------------------------------------------
  const handleAddNoteFromSelection = useCallback((text: string) => {
    setNoteDraft(`"${text}"\n\n`);
    setNotesOpen(true);
  }, []);

  async function handleSaveNote(content: string) {
    const passageId = currentPassage?.id ?? null;
    setNotes((prev) => [...prev, { id: `temp-${Date.now()}`, passageId, content }]);
    const result = await saveNoteAction(resultId, { passageId: passageId ?? undefined, content });
    if (!result.success) toast.error(result.error);
  }

  async function handleDeleteNote(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (!noteId.startsWith("temp-")) {
      await deleteNoteAction(resultId, noteId);
    }
  }

  // ---- finishing ----------------------------------------------------------------------------------------------------
  const handleExpire = useCallback(() => {
    toast.info("Time's up — submitting your test.");
    startSubmitTransition(async () => {
      await flushPendingWork();
      await submitAttemptAction(resultId);
    });
  }, [resultId, flushPendingWork]);

  // The server finalised this attempt while the page was open (a teacher ended the section, or its time ran out while the browser was offline):
  // hand-in is a no-op then, and the student is taken on to whatever comes next.
  const attemptEndedHandled = useRef(false);
  useEffect(() => {
    onAttemptEnded.current = () => {
      if (attemptEndedHandled.current) return;
      attemptEndedHandled.current = true;
      toast.info("This section has ended - taking you on.");
      startSubmitTransition(async () => {
        await submitAttemptAction(resultId);
      });
    };
  }, [resultId]);

  function handleSubmit() {
    startSubmitTransition(async () => {
      await flushPendingWork();
      await submitAttemptAction(resultId);
    });
  }

  // ---- Listening transfer time (Full Mock only) -------------------------------------------------------------------
  // The official 40-minute Listening runs on the main timer; once the RECORDING ends, the exam switches to 2 minutes of transfer time (check answers, nothing new is played) and submits itself when that runs out. The moment the recording ended is stored on the server, so a refresh resumes the same countdown instead of restarting it.
  const transferTotalSeconds = FULL_MOCK_LISTENING_TRANSFER_MINUTES * 60;
  const [transferSeconds, setTransferSeconds] = useState<number | null>(fullMock?.transferSecondsRemaining ?? null);
  const transferStarted = useRef(fullMock?.transferSecondsRemaining != null);
  const inTransfer = testType === "LISTENING" && fullMock != null && transferSeconds != null;
  const lastAudioSrc = sortedPassages[sortedPassages.length - 1]?.audioUrl ?? null;

  const handleAudioEnded = useCallback(
    (src: string) => {
      if (!fullMock || testType !== "LISTENING" || transferStarted.current) return;
      // With a separate recording per part only the LAST part's ending counts; with one shared recording every part has the same source, so its ending does.
      if (lastAudioSrc && src !== lastAudioSrc) return;
      transferStarted.current = true;
      setTransferSeconds(transferTotalSeconds);
      void markListeningAudioEndedAction(fullMock.attemptId).then((reply) => {
        if (reply.success && Math.abs(reply.transferSecondsRemaining - transferTotalSeconds) > 2) setTransferSeconds(reply.transferSecondsRemaining);
      });
    },
    [fullMock, testType, lastAudioSrc, transferTotalSeconds]
  );

  const handleTransferExpire = useCallback(() => {
    toast.info("Transfer time is over — submitting your Listening test.");
    startSubmitTransition(async () => {
      await flushPendingWork();
      await submitAttemptAction(resultId);
    });
  }, [resultId, flushPendingWork]);

  // Phase I - the recording that belongs to each part, for the official Listening screen.
  const partAudio = useMemo(() => sections.map((section, index) => ({ partIndex: index, src: section.passage?.audioUrl ?? null })), [sections]);

  const currentPassageNotes: ExamNote[] = useMemo(
    () => notes.filter((n) => n.passageId === (currentPassage?.id ?? null)),
    [notes, currentPassage]
  );

  // ---- panels -------------------------------------------------------------------------------------------------------
  const passageHighlights = currentPassage ? (highlightStore.rangesByRegion.get(passageRegion(currentPassage.id)) ?? EMPTY_RANGES) : EMPTY_RANGES;

  const passagePanel = currentPassage ? (
    <PassagePanel
      key={currentPassage.id}
      passageId={currentPassage.id}
      title={currentPassage.title}
      sectionLabel={readingSectionLabel}
      content={currentPassage.content}
      highlights={passageHighlights}
      attachments={currentPassage.attachments}
      getRanges={highlightStore.getRanges}
      onHighlight={highlightStore.addHighlights}
      onClear={highlightStore.clearRanges}
      onRemove={highlightStore.removeHighlights}
      onAddNote={handleAddNoteFromSelection}
    />
  ) : null;

  const questionsList = (
    <QuestionHighlightProvider value={highlightStore.rangesByRegion}>
      <HighlightSurface
        getRanges={highlightStore.getRanges}
        onHighlight={highlightStore.addHighlights}
        onClear={highlightStore.clearRanges}
        onRemove={highlightStore.removeHighlights}
      >
        {/* A <fieldset disabled> locks every answer control at once while the test is being submitted (or has timed out): anything typed after that point could no longer be saved, so it must not look as if it had been. */}
        <fieldset
          ref={questionsPanelRef}
          disabled={submitting}
          onFocusCapture={handlePanelInteraction}
          onPointerDownCapture={handlePanelInteraction}
          onKeyDown={handleAnswerKeyDown}
          className="m-0 min-w-0 space-y-7 border-0 p-0"
        >
          {currentQuestions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No questions in this section.</p>
          ) : (
            currentQuestions.map((question) => (
              <QuestionBlock
                key={question.id}
                question={question}
                value={answers[question.id]}
                flagged={flags.has(question.id)}
                bookmarked={bookmarks.has(question.id)}
                activeNumber={effectiveActiveNumber >= question.startNumber && effectiveActiveNumber <= question.endNumber ? effectiveActiveNumber : -1}
                onAnswer={handleAnswerChange}
                onToggleFlag={handleToggleFlag}
                onToggleBookmark={handleToggleBookmark}
                onSelectNumber={goToQuestion}
              />
            ))
          )}
        </fieldset>
      </HighlightSurface>
    </QuestionHighlightProvider>
  );

  const questionsKey = currentPassage?.id ?? "questions";
  const leftPanel =
    testType === "READING" ? passagePanel : currentPassage && <ListeningLeftPanel passage={currentPassage} sectionLabel={listeningSectionLabel} onAudioEnded={handleAudioEnded} />;
  const isReading = testType === "READING";

  const navigatorTabs = (
    <Tabs defaultValue="navigator">
      <TabsList className="w-full">
        <TabsTrigger value="navigator">Navigator</TabsTrigger>
        <TabsTrigger value="answers">Your Answers</TabsTrigger>
      </TabsList>
      <TabsContent value="navigator">
        <QuestionNavigator questions={navigatorItems} currentQuestionId={effectiveActiveQuestionId} currentNumber={effectiveActiveNumber} onSelect={goToQuestion} />
      </TabsContent>
      <TabsContent value="answers">
        <YourAnswersPanel questions={answerSummaryQuestions} currentQuestionId={effectiveActiveQuestionId} onSelect={goToQuestion} />
      </TabsContent>
    </Tabs>
  );

  // Phase G — the official computer-delivered screen draws exactly the same attempt (answers, flags, highlights, autosave, position, submit) that the legacy screen below draws. Everything above has already run, so switching screens changes nothing but the markup.
  if (ui === "official" && isReading) {
    return (
      <OfficialReadingExam
        session={{
          candidateName,
          initialRemainingSeconds,
          onExpire: handleExpire,
          preferencesCookieName: examPreferencesCookieName(preferenceKey),
          initialPreferences,
          sections,
          sectionIndex,
          groups,
          passageGroups,
          activeNumber: effectiveActiveNumber,
          activeQuestionId: effectiveActiveQuestionId,
          answers,
          flags,
          onAnswer: handleAnswerChange,
          onToggleFlag: handleToggleFlag,
          goToQuestion,
          goToPassage: handleSelectPassage,
          onPrevious: goToPrevious,
          onNext: goToNext,
          hasPrevious: adjacentNumber(passageGroups, effectiveActiveNumber, -1) !== null,
          hasNext: adjacentNumber(passageGroups, effectiveActiveNumber, 1) !== null,
          highlights: highlightStore,
          panelRef: questionsPanelRef,
          onPanelInteraction: handlePanelInteraction,
          onAnswerKeyDown: handleAnswerKeyDown,
          mobileTab,
          onMobileTabChange: setMobileTab,
          submitting,
          onSubmit: handleSubmit,
          answeredCount,
          flaggedCount,
          totalQuestionCount,
        }}
      />
    );
  }

  // Phase I - the same attempt on the official computer-delivered Listening screen: one pane of questions, a recording that plays once by itself.
  if (ui === "official" && !isReading) {
    return (
      <OfficialListeningExam
        session={{
          candidateName,
          initialRemainingSeconds,
          onExpire: handleExpire,
          preferencesCookieName: examPreferencesCookieName(preferenceKey),
          initialPreferences,
          sections,
          sectionIndex,
          groups,
          passageGroups,
          activeNumber: effectiveActiveNumber,
          activeQuestionId: effectiveActiveQuestionId,
          answers,
          flags,
          onAnswer: handleAnswerChange,
          onToggleFlag: handleToggleFlag,
          goToQuestion,
          goToPassage: handleSelectPassage,
          onPrevious: goToPrevious,
          onNext: goToNext,
          hasPrevious: adjacentNumber(passageGroups, effectiveActiveNumber, -1) !== null,
          hasNext: adjacentNumber(passageGroups, effectiveActiveNumber, 1) !== null,
          highlights: highlightStore,
          panelRef: questionsPanelRef,
          onPanelInteraction: handlePanelInteraction,
          onAnswerKeyDown: handleAnswerKeyDown,
          submitting,
          onSubmit: handleSubmit,
          answeredCount,
          flaggedCount,
          totalQuestionCount,
          resultId,
          parts: partAudio,
          elapsedSecondsAtRender: listeningElapsedSeconds,
          timed: listeningTimed,
          goToSection,
          onReviewOver: handleTransferExpire,
          onRecordingEnded: handleAudioEnded,
        }}
      />
    );
  }

  return (
    <div ref={examContainerRef} className="bg-background flex h-svh flex-col">
      {/* Phase D — the timer sits in the exact centre of the header on every screen size, large enough to read at a glance and never pushed around by the buttons either side of it. */}
      <header className="border-border/70 grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Leave test and go home" onClick={() => setLeaveDialogOpen(true)}>
            <Home className="size-4.5" />
          </Button>
          <h1 className="font-display hidden min-w-0 truncate text-base font-medium sm:block sm:text-lg">{testTitle}</h1>
          {pendingSaves > 0 && (
            <span className="text-muted-foreground hidden shrink-0 items-center gap-1.5 text-xs xl:flex">
              <Loader2 className="size-3 animate-spin" /> Saving…
            </span>
          )}
        </div>

        <div className="justify-self-center">
          {inTransfer ? (
            <ExamTimer key="transfer" size="large" label="Transfer time" durationSeconds={transferSeconds} onExpire={handleTransferExpire} />
          ) : (
            <ExamTimer key="main" size="large" durationSeconds={initialRemainingSeconds} onExpire={handleExpire} />
          )}
        </div>

        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          {/* On a phone Notes / Answers live in the strip under the header (the timer needs the room); from sm: up they sit here. */}
          {isReading && (
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => setNotesOpen(true)} aria-label="Notes" title="Notes">
              <NotebookPen className="size-4" />
              <span className="hidden xl:inline">Notes</span>
            </Button>
          )}
          {isReading && (
            <Button variant="outline" size="sm" className="hidden sm:inline-flex xl:hidden" onClick={() => setNavOpen(true)} aria-label="Your answers" title="Your answers">
              <List className="size-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={toggleFocusMode}
            aria-pressed={focusMode}
            aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
          >
            {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            <span className="hidden xl:inline">{focusMode ? "Exit Focus" : "Focus Mode"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReviewOpen(true)} aria-label="Review answers" title="Review answers">
            <ClipboardList className="size-4" />
            <span className="hidden xl:inline">Review</span>
          </Button>
          {isReading && (
            <Button size="sm" onClick={() => setSubmitDialogOpen(true)}>
              Submit
            </Button>
          )}
        </div>
      </header>

      {inTransfer && (
        <div role="status" data-testid="transfer-banner" className="bg-accent/10 text-accent border-accent/30 shrink-0 border-b px-4 py-2 text-center text-sm font-medium sm:px-6">
          The recording has finished. Use this transfer time to check your answers — your Listening test submits automatically when it runs out.
        </div>
      )}

      {/* Phase 41 — Part 3/12: real current-position tracking + a top progress bar, always visible regardless of skill. */}
      <div className="border-border/70 flex shrink-0 items-center gap-3 border-b px-4 py-1.5 sm:px-6">
        <span className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
          {activeSectionLabel} · Question {effectiveActiveNumber} of {totalQuestionCount}
        </span>
        <div className="bg-secondary h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
          <div className="bg-success h-full rounded-full transition-all duration-500" style={{ width: `${completionPercent}%` }} />
        </div>
        <span className="text-muted-foreground hidden shrink-0 text-xs font-medium tabular-nums sm:inline">
          {answeredCount} / {totalQuestionCount} Answered
        </span>
        {isReading && (
          <div className="flex shrink-0 items-center gap-1 sm:hidden">
            <button type="button" onClick={() => setNotesOpen(true)} aria-label="Notes" className="text-muted-foreground hover:bg-secondary focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-2">
              <NotebookPen className="size-4" />
            </button>
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Your answers" className="text-muted-foreground hover:bg-secondary focus-visible:ring-ring/50 flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-2">
              <List className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Only the layout that is on screen is rendered: one passage, one set of questions, one set of element ids. */}
        {isDesktop ? (
          <div className="h-full flex-1 overflow-hidden">
            <ResizableSplit
              leftClassName="overflow-hidden border-r border-border/70"
              rightClassName="overflow-hidden"
              leftLabel={isReading ? "Passage" : "Audio"}
              left={leftPanel}
              right={
                <div key={questionsKey} className="h-full overflow-y-auto">
                  <div className={isReading ? "px-6 py-6 sm:px-8 sm:py-8" : "mx-auto w-full max-w-3xl px-6 py-6 sm:px-8 sm:py-8"}>{questionsList}</div>
                </div>
              }
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <MobileSplitTabs
              leftLabel={isReading ? "Passage" : "Audio & Materials"}
              value={mobileTab}
              onValueChange={setMobileTab}
              left={leftPanel}
              right={
                <div key={questionsKey} className="h-full overflow-y-auto px-4 py-5 sm:px-6">
                  {questionsList}
                </div>
              }
            />
          </div>
        )}

        {/* The side panel (Navigator / Your Answers) is unchanged for both skills; Focus Mode hides it, and below lg the header's Answers button opens the same panel. */}
        {!focusMode && (
          <aside className={cn("border-border/70 hidden w-72 shrink-0 overflow-y-auto border-l p-5", isReading ? "xl:block" : "lg:block")}>{navigatorTabs}</aside>
        )}
      </div>

      {/* Phase 41 — Part 10's mobile floating navigator button (Listening; Reading has the passage bar). Badge shows how many questions still need attention. */}
      {!isReading && (
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open question navigator"
          className="bg-primary text-primary-foreground shadow-soft-lg fixed right-5 bottom-20 z-30 flex size-14 items-center justify-center rounded-full lg:hidden"
        >
          <List className="size-5" />
          {totalQuestionCount - answeredCount > 0 && (
            <span className="bg-accent text-accent-foreground absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[10px] font-semibold">
              {totalQuestionCount - answeredCount}
            </span>
          )}
        </button>
      )}

      {isReading ? (
        <PassageNavBar
          groups={passageGroups}
          activeNumber={effectiveActiveNumber}
          activeGroupKey={activeGroupKey}
          compact={!isDesktop}
          onSelectNumber={handleSelectNavNumber}
          onSelectPassage={handleSelectPassage}
          onPrevious={goToPrevious}
          onNext={goToNext}
          hasPrevious={adjacentNumber(passageGroups, effectiveActiveNumber, -1) !== null}
          hasNext={adjacentNumber(passageGroups, effectiveActiveNumber, 1) !== null}
        />
      ) : (
        <footer className="border-border/70 bg-background/95 flex shrink-0 flex-col gap-2.5 border-t px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ListeningPartNav parts={listeningParts} currentIndex={sectionIndex} onSelect={goToSection} />
            <Button size="sm" onClick={() => setSubmitDialogOpen(true)}>
              Submit
            </Button>
          </div>
        </footer>
      )}

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="right">
          <SheetHeader className="border-b">
            <SheetTitle>Questions</SheetTitle>
            <SheetDescription className="sr-only">Jump to any question</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto p-5">{navigatorTabs}</div>
        </SheetContent>
      </Sheet>

      <NotesDrawer
        open={notesOpen}
        onOpenChange={setNotesOpen}
        notes={currentPassageNotes}
        draft={noteDraft}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
      />

      <ReviewCenter
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        questions={navigatorItems}
        currentQuestionId={effectiveActiveQuestionId}
        currentNumber={effectiveActiveNumber}
        onSelect={goToQuestion}
        onSubmit={() => {
          setReviewOpen(false);
          setSubmitDialogOpen(true);
        }}
      />

      <SubmitConfirmationDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        totalQuestions={totalQuestionCount}
        answeredCount={answeredCount}
        flaggedCount={flaggedCount}
        submitting={submitting}
        onConfirm={handleSubmit}
        onReview={() => {
          setSubmitDialogOpen(false);
          setReviewOpen(true);
        }}
      />

      <LeaveTestDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        onConfirm={() => router.push("/student/dashboard")}
      />
    </div>
  );
}
