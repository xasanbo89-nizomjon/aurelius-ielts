"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HighlightColor, QuestionType } from "@prisma/client";
import { Bookmark, ChevronLeft, ChevronRight, ClipboardList, Flag, Home, List, Loader2, Maximize2, Minimize2, NotebookPen } from "lucide-react";
import { toast } from "sonner";

import {
  addHighlightAction,
  deleteNoteAction,
  removeHighlightAction,
  saveAnswerAction,
  saveNoteAction,
  submitAttemptAction,
  toggleFlagAction,
  updateLastSeenQuestionAction,
} from "@/actions/exam.actions";
import { toggleQuestionBookmarkAction } from "@/actions/bookmarks.actions";
import { cn } from "@/lib/utils";
import { isResponseAnswered } from "@/lib/exam/grading";
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
import { NotesDrawer, type ExamNote } from "@/components/exam/notes-drawer";
import { AudioPlayer } from "@/components/exam/audio-player";
import { PassageAttachments, type ExamAttachment } from "@/components/exam/passage-attachments";
import { MobileSplitTabs } from "@/components/exam/mobile-split-tabs";
import { QuestionRenderer } from "@/components/exam/question-types/question-renderer";

export type ExamQuestion = {
  id: string;
  passageId: string | null;
  type: QuestionType;
  prompt: string;
  options: unknown;
  orderIndex: number;
};

export type ExamPassage = {
  id: string;
  title: string;
  content: string;
  audioUrl: string | null;
  orderIndex: number;
  attachments: ExamAttachment[];
};

export type ExamHighlight = { id: string; passageId: string; text: string; startOffset: number; endOffset: number; color: HighlightColor };
export type ExamNoteRecord = { id: string; passageId: string | null; content: string };

export function ExamRunner({
  resultId,
  testTitle,
  testType,
  durationMinutes,
  startedAt,
  passages,
  questions,
  initialAnswers,
  initialFlags,
  initialBookmarks,
  initialHighlights,
  initialNotes,
  initialLastSeenQuestionId,
}: {
  resultId: string;
  testTitle: string;
  testType: "READING" | "LISTENING";
  durationMinutes: number | null;
  startedAt: string;
  passages: ExamPassage[];
  questions: ExamQuestion[];
  initialAnswers: Record<string, unknown>;
  initialFlags: string[];
  initialBookmarks: string[];
  initialHighlights: ExamHighlight[];
  initialNotes: ExamNoteRecord[];
  initialLastSeenQuestionId: string | null;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [flags, setFlags] = useState<Set<string>>(() => new Set(initialFlags));
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => new Set(initialBookmarks));
  const [highlights, setHighlights] = useState<ExamHighlight[]>(initialHighlights);
  const [notes, setNotes] = useState<ExamNoteRecord[]>(initialNotes);
  // Phase 24 — "student returns exactly where they left": which passage/part
  // they were on is remembered per-attempt so a refresh doesn't drop them
  // back to the start. Per-viewer convenience only (localStorage), restored
  // in an effect (not the initializer) to avoid an SSR/hydration mismatch —
  // answers/timer/flags/bookmarks already restore for real from the server
  // regardless of whether this happens to be available.
  const [sectionIndex, setSectionIndex] = useState(0);
  // Phase 41 — Part 3/14/15: the exact question the student was last on,
  // real and server-backed (Result.lastSeenQuestionId) — takes priority over
  // the older Phase 24 client-only section memory below, which now only
  // serves as a fallback for attempts started before this field existed.
  const [activeQuestionId, setActiveQuestionId] = useState<string>(
    () => (initialLastSeenQuestionId && questions.some((q) => q.id === initialLastSeenQuestionId) ? initialLastSeenQuestionId : "")
  );

  useEffect(() => {
    if (initialLastSeenQuestionId) {
      const question = questions.find((q) => q.id === initialLastSeenQuestionId);
      const orderedPassages = [...passages].sort((a, b) => a.orderIndex - b.orderIndex);
      const targetSection = question ? orderedPassages.findIndex((p) => p.id === question.passageId) : -1;
      if (targetSection >= 0) {
        setSectionIndex(targetSection);
        return;
      }
    }
    try {
      const saved = window.localStorage.getItem(`exam-section-${resultId}`);
      if (saved) setSectionIndex(Number(saved) || 0);
    } catch {
      // Private browsing / storage disabled — just starts from section 0.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore, resultId/initialLastSeenQuestionId are stable for this component's lifetime
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

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastSeenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const examContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const sortedPassages = useMemo(() => [...passages].sort((a, b) => a.orderIndex - b.orderIndex), [passages]);
  const sortedQuestions = useMemo(() => [...questions].sort((a, b) => a.orderIndex - b.orderIndex), [questions]);

  const currentPassage: ExamPassage | undefined = sortedPassages[sectionIndex];

  const currentQuestions = useMemo(
    () =>
      sortedQuestions.filter((question) =>
        currentPassage ? question.passageId === currentPassage.id : question.passageId == null
      ),
    [sortedQuestions, currentPassage]
  );

  const navigatorItems: NavigatorQuestionState[] = useMemo(
    () =>
      sortedQuestions.map((question, index) => ({
        id: question.id,
        number: index + 1,
        answered: isResponseAnswered(answers[question.id]),
        flagged: flags.has(question.id),
      })),
    [sortedQuestions, answers, flags]
  );

  const answerSummaryQuestions: AnswerSummaryQuestion[] = useMemo(
    () =>
      sortedQuestions.map((question, index) => ({
        id: question.id,
        number: index + 1,
        type: question.type,
        prompt: question.prompt,
        options: question.options,
        value: answers[question.id],
      })),
    [sortedQuestions, answers]
  );

  const answeredCount = navigatorItems.filter((item) => item.answered).length;
  const completionPercent = sortedQuestions.length > 0 ? Math.round((answeredCount / sortedQuestions.length) * 100) : 0;

  // Phase 41 — Part 3's real current-question tracking, self-healing if
  // activeQuestionId ever references a question outside the current data
  // (stale localStorage, teacher edited the test) by falling back to the
  // current section's first question.
  const effectiveActiveQuestionId =
    activeQuestionId && sortedQuestions.some((q) => q.id === activeQuestionId) ? activeQuestionId : (currentQuestions[0]?.id ?? "");
  const activeQuestionNumber = sortedQuestions.findIndex((q) => q.id === effectiveActiveQuestionId) + 1;
  const activeSectionLabel = testType === "LISTENING" ? currentPassage?.title || `Part ${sectionIndex + 1}` : `Passage ${sectionIndex + 1}`;

  const listeningParts: ListeningPart[] = useMemo(
    () =>
      sortedPassages.map((passage, index) => {
        const partQuestions = sortedQuestions.filter((q) => q.passageId === passage.id);
        return {
          id: passage.id,
          index,
          title: passage.title || `Part ${index + 1}`,
          questionCount: partQuestions.length,
          answeredCount: partQuestions.filter((q) => isResponseAnswered(answers[q.id])).length,
        };
      }),
    [sortedPassages, sortedQuestions, answers]
  );

  const initialRemainingSeconds = useMemo(() => {
    if (durationMinutes == null) return null;
    const elapsedMs = Date.now() - new Date(startedAt).getTime();
    return Math.max(0, durationMinutes * 60 - Math.floor(elapsedMs / 1000));
  }, [durationMinutes, startedAt]);

  function handleAnswerChange(questionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    const existing = saveTimers.current.get(questionId);
    if (existing) clearTimeout(existing);

    setPendingSaves((count) => count + 1);
    const timer = setTimeout(() => {
      saveTimers.current.delete(questionId);
      void saveAnswerAction(resultId, questionId, value as never).finally(() => {
        setPendingSaves((count) => Math.max(0, count - 1));
      });
    }, 600);
    saveTimers.current.set(questionId, timer);
  }

  function handleToggleFlag(questionId: string) {
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    void toggleFlagAction(resultId, questionId);
  }

  function handleToggleBookmark(questionId: string) {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    void toggleQuestionBookmarkAction(questionId);
  }

  /** Finds the first real focusable answer control inside a question's container — works generically across every question type (text inputs, selects, radios) without type-specific logic. */
  function focusQuestionInput(questionId: string) {
    const container = document.getElementById(`question-${questionId}`);
    const control = container?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, [role="combobox"], [role="radio"]'
    );
    control?.focus();
  }

  /** Phase 41 — Part 14/15: debounced real persistence of "where the student currently is", so a refresh (or a different device) resumes at the exact question, not just the section. */
  function persistLastSeenQuestion(questionId: string) {
    if (lastSeenTimer.current) clearTimeout(lastSeenTimer.current);
    lastSeenTimer.current = setTimeout(() => {
      void updateLastSeenQuestionAction(resultId, questionId);
    }, 800);
  }

  function goToQuestion(questionId: string) {
    const question = sortedQuestions.find((q) => q.id === questionId);
    if (!question) return;
    const targetSection = sortedPassages.findIndex((p) => p.id === question.passageId);
    if (targetSection >= 0 && targetSection !== sectionIndex) setSectionIndex(targetSection);
    setActiveQuestionId(questionId);
    persistLastSeenQuestion(questionId);
    setNavOpen(false);
    setReviewOpen(false);
    requestAnimationFrame(() => {
      document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      focusQuestionInput(questionId);
    });
  }

  /** Section-level navigation (Reading's Prev/Next, Listening's part tabs) also resets the tracked active question to that section's first one, keeping the navigator's "current question" ring accurate. */
  function goToSection(index: number) {
    setSectionIndex(index);
    const passage = sortedPassages[index];
    const first = sortedQuestions.find((q) => (passage ? q.passageId === passage.id : q.passageId == null));
    if (first) {
      setActiveQuestionId(first.id);
      persistLastSeenQuestion(first.id);
    }
  }

  /** Phase 41 — Part 11's keyboard shortcuts: Left/Right jump to the previous/next question in real test order. Only fires when nothing is specifically focused (no active input, textarea, radio, or combobox), so it never hijacks native arrow-key behavior inside an answer control. */
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (document.activeElement && document.activeElement !== document.body) return;
      const currentIndex = sortedQuestions.findIndex((q) => q.id === effectiveActiveQuestionId);
      if (currentIndex === -1) return;
      const nextIndex = event.key === "ArrowRight" ? currentIndex + 1 : currentIndex - 1;
      const target = sortedQuestions[nextIndex];
      if (!target) return;
      event.preventDefault();
      goToQuestion(target.id);
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goToQuestion reads fresh state via closure each call; sortedQuestions/effectiveActiveQuestionId are the real reactive deps
  }, [sortedQuestions, effectiveActiveQuestionId]);

  // Listening: auto-focus the first answer box of a part the moment it loads (new part navigation, or the very first part on load) — a real IELTS Listening habit, since audio starts before the student has clicked anything.
  useEffect(() => {
    if (testType !== "LISTENING") return;
    const firstQuestion = currentQuestions[0];
    if (!firstQuestion) return;
    const frame = requestAnimationFrame(() => focusQuestionInput(firstQuestion.id));
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

  async function handleHighlight(text: string, start: number, end: number, color: HighlightColor) {
    if (!currentPassage) return;
    const passageId = currentPassage.id;
    const result = await addHighlightAction(resultId, { passageId, text, startOffset: start, endOffset: end, color });
    if (result.success && result.highlightId) {
      setHighlights((prev) => [...prev, { id: result.highlightId!, passageId, text, startOffset: start, endOffset: end, color }]);
    } else if (!result.success) {
      toast.error(result.error);
    }
  }

  async function handleRemoveHighlight(highlightId: string) {
    setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
    await removeHighlightAction(resultId, highlightId);
  }

  function handleAddNoteFromSelection(text: string) {
    setNoteDraft(`"${text}"\n\n`);
    setNotesOpen(true);
  }

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

  const handleExpire = useCallback(() => {
    toast.info("Time's up — submitting your test.");
    startSubmitTransition(async () => {
      await submitAttemptAction(resultId);
    });
  }, [resultId]);

  function handleSubmit() {
    startSubmitTransition(async () => {
      await submitAttemptAction(resultId);
    });
  }

  const currentPassageHighlights = useMemo(
    () => highlights.filter((h) => h.passageId === currentPassage?.id),
    [highlights, currentPassage]
  );
  const currentPassageNotes: ExamNote[] = useMemo(
    () => notes.filter((n) => n.passageId === (currentPassage?.id ?? null)),
    [notes, currentPassage]
  );

  const questionsList = (
    <div className="space-y-7">
      {currentQuestions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No questions in this section.</p>
      ) : (
        currentQuestions.map((question) => {
          const number = sortedQuestions.findIndex((q) => q.id === question.id) + 1;
          const flagged = flags.has(question.id);
          const bookmarked = bookmarks.has(question.id);
          return (
            <div key={question.id} id={`question-${question.id}`} className="scroll-mt-24 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground mr-1.5">{number}.</span>
                  {question.prompt}
                </p>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleToggleBookmark(question.id)}
                    aria-pressed={bookmarked}
                    aria-label={bookmarked ? `Remove bookmark from question ${number}` : `Bookmark question ${number} to revisit later`}
                    className={cn(
                      "focus-visible:ring-ring/50 rounded-md p-1.5 outline-none focus-visible:ring-2",
                      bookmarked ? "text-accent" : "text-muted-foreground hover:text-accent"
                    )}
                  >
                    <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFlag(question.id)}
                    aria-pressed={flagged}
                    aria-label={flagged ? `Remove flag from question ${number}` : `Flag question ${number} for review`}
                    className={cn(
                      "focus-visible:ring-ring/50 rounded-md p-1.5 outline-none focus-visible:ring-2",
                      flagged ? "text-accent" : "text-muted-foreground hover:text-accent"
                    )}
                  >
                    <Flag className={cn("size-4", flagged && "fill-current")} />
                  </button>
                </div>
              </div>
              <QuestionRenderer
                questionId={question.id}
                type={question.type}
                options={question.options}
                value={answers[question.id]}
                onChange={(value) => handleAnswerChange(question.id, value)}
              />
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div ref={examContainerRef} className="bg-background flex h-svh flex-col">
      <header className="border-border/70 relative flex h-16 shrink-0 items-center gap-2 border-b px-4 sm:gap-3 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Leave test and go home"
          onClick={() => setLeaveDialogOpen(true)}
        >
          <Home className="size-4.5" />
        </Button>
        <h1 className="font-display min-w-0 flex-1 truncate text-base font-medium sm:text-lg">{testTitle}</h1>
        {pendingSaves > 0 && (
          <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex">
            <Loader2 className="size-3 animate-spin" /> Saving…
          </span>
        )}
        {testType === "LISTENING" ? (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <ExamTimer durationSeconds={initialRemainingSeconds} onExpire={handleExpire} />
          </div>
        ) : (
          <ExamTimer durationSeconds={initialRemainingSeconds} onExpire={handleExpire} />
        )}
        {testType === "READING" && (
          <Button variant="outline" size="sm" onClick={() => setNotesOpen(true)}>
            <NotebookPen className="size-4" />
            <span className="hidden sm:inline">Notes</span>
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
        <Button variant="outline" size="sm" onClick={() => setReviewOpen(true)}>
          <ClipboardList className="size-4" />
          <span className="hidden sm:inline">Review</span>
        </Button>
        {testType === "READING" && (
          <Button size="sm" onClick={() => setSubmitDialogOpen(true)}>
            Submit
          </Button>
        )}
      </header>

      {/* Phase 41 — Part 3/12: real current-position tracking + a top progress bar, always visible regardless of skill. */}
      <div className="border-border/70 flex shrink-0 items-center gap-3 border-b px-4 py-1.5 sm:px-6">
        <span className="text-muted-foreground shrink-0 text-xs font-medium tabular-nums">
          {activeSectionLabel} · Question {activeQuestionNumber > 0 ? activeQuestionNumber : "–"} of {sortedQuestions.length}
        </span>
        <div className="bg-secondary h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
          <div className="bg-success h-full rounded-full transition-all duration-500" style={{ width: `${completionPercent}%` }} />
        </div>
        <span className="text-muted-foreground hidden shrink-0 text-xs font-medium tabular-nums sm:inline">
          {answeredCount} / {sortedQuestions.length} Answered
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {testType === "READING" ? (
          <>
            {/* Desktop split screen (Part 1) — independent scrolling, both panels always visible. */}
            <div className="border-border/70 hidden w-1/2 overflow-hidden border-r lg:block">
              {currentPassage && (
                <PassagePanel
                  title={currentPassage.title}
                  content={currentPassage.content}
                  highlights={currentPassageHighlights}
                  attachments={currentPassage.attachments}
                  onHighlight={handleHighlight}
                  onRemoveHighlight={handleRemoveHighlight}
                  onAddNote={handleAddNoteFromSelection}
                />
              )}
            </div>
            <div className="hidden flex-1 overflow-y-auto lg:block">
              <div className="px-6 py-6 sm:px-8 sm:py-8">{questionsList}</div>
            </div>

            {/* Mobile: tabs instead of split screen (Part 9) — no stacked double-scroll. */}
            <div className="flex flex-1 flex-col overflow-hidden lg:hidden">
              <MobileSplitTabs
                leftLabel="Passage"
                left={
                  currentPassage && (
                    <PassagePanel
                      title={currentPassage.title}
                      content={currentPassage.content}
                      highlights={currentPassageHighlights}
                      attachments={currentPassage.attachments}
                      onHighlight={handleHighlight}
                      onRemoveHighlight={handleRemoveHighlight}
                      onAddNote={handleAddNoteFromSelection}
                    />
                  )
                }
                right={<div className="h-full overflow-y-auto px-4 py-5 sm:px-6">{questionsList}</div>}
              />
            </div>
          </>
        ) : (
          <>
            {/* Desktop split screen (Part 5) — audio + visual materials on the left, questions on the right. */}
            <div className="border-border/70 hidden w-1/2 overflow-y-auto border-r p-5 lg:block">
              {currentPassage && (
                <div className="space-y-5">
                  {currentPassage.audioUrl && <AudioPlayer src={currentPassage.audioUrl} label={currentPassage.title} />}
                  <PassageAttachments attachments={currentPassage.attachments} />
                </div>
              )}
            </div>
            <div className="hidden flex-1 overflow-y-auto lg:block">
              <div className="mx-auto w-full max-w-3xl px-6 py-6 sm:px-8 sm:py-8">{questionsList}</div>
            </div>

            {/* Mobile: tabs (Part 9) — audio stays reachable behind its own tab instead of a sticky bar eating vertical space. */}
            <div className="flex flex-1 flex-col overflow-hidden lg:hidden">
              <MobileSplitTabs
                leftLabel="Audio & Materials"
                left={
                  currentPassage && (
                    <div className="space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
                      {currentPassage.audioUrl && <AudioPlayer src={currentPassage.audioUrl} label={currentPassage.title} />}
                      <PassageAttachments attachments={currentPassage.attachments} />
                    </div>
                  )
                }
                right={<div className="h-full overflow-y-auto px-4 py-5 sm:px-6">{questionsList}</div>}
              />
            </div>
          </>
        )}

        {!focusMode && (
          <aside className="border-border/70 hidden w-72 shrink-0 overflow-y-auto border-l p-5 lg:block">
            <Tabs defaultValue="navigator">
              <TabsList className="w-full">
                <TabsTrigger value="navigator">Navigator</TabsTrigger>
                <TabsTrigger value="answers">Your Answers</TabsTrigger>
              </TabsList>
              <TabsContent value="navigator">
                <QuestionNavigator
                  questions={navigatorItems}
                  currentQuestionId={effectiveActiveQuestionId}
                  onSelect={goToQuestion}
                />
              </TabsContent>
              <TabsContent value="answers">
                <YourAnswersPanel
                  questions={answerSummaryQuestions}
                  currentQuestionId={effectiveActiveQuestionId}
                  onSelect={goToQuestion}
                />
              </TabsContent>
            </Tabs>
          </aside>
        )}
      </div>

      {/* Phase 41 — Part 10's mobile floating navigator button. Replaces the old header "Questions" button (header was already crowded), badge shows how many questions still need attention. */}
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label="Open question navigator"
        className="bg-primary text-primary-foreground shadow-soft-lg fixed right-5 bottom-5 z-30 flex size-14 items-center justify-center rounded-full lg:hidden"
      >
        <List className="size-5" />
        {sortedQuestions.length - answeredCount > 0 && (
          <span className="bg-accent text-accent-foreground absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full text-[10px] font-semibold">
            {sortedQuestions.length - answeredCount}
          </span>
        )}
      </button>

      {testType === "LISTENING" ? (
        <footer className="border-border/70 bg-background/95 flex shrink-0 flex-col gap-2.5 border-t px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ListeningPartNav parts={listeningParts} currentIndex={sectionIndex} onSelect={goToSection} />
            <Button size="sm" onClick={() => setSubmitDialogOpen(true)}>
              Submit
            </Button>
          </div>
        </footer>
      ) : (
        <footer className="border-border/70 flex h-16 shrink-0 items-center justify-between border-t px-4 sm:px-6">
          <Button variant="outline" size="sm" onClick={() => goToSection(Math.max(0, sectionIndex - 1))} disabled={sectionIndex === 0}>
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Section {sectionIndex + 1} of {sortedPassages.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToSection(Math.min(sortedPassages.length - 1, sectionIndex + 1))}
            disabled={sectionIndex >= sortedPassages.length - 1}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </footer>
      )}

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="right">
          <SheetHeader className="border-b">
            <SheetTitle>Questions</SheetTitle>
            <SheetDescription className="sr-only">Jump to any question</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto p-5">
            <Tabs defaultValue="navigator">
              <TabsList className="w-full">
                <TabsTrigger value="navigator">Navigator</TabsTrigger>
                <TabsTrigger value="answers">Your Answers</TabsTrigger>
              </TabsList>
              <TabsContent value="navigator">
                <QuestionNavigator
                  questions={navigatorItems}
                  currentQuestionId={effectiveActiveQuestionId}
                  onSelect={goToQuestion}
                />
              </TabsContent>
              <TabsContent value="answers">
                <YourAnswersPanel
                  questions={answerSummaryQuestions}
                  currentQuestionId={effectiveActiveQuestionId}
                  onSelect={goToQuestion}
                />
              </TabsContent>
            </Tabs>
          </div>
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
        onSelect={goToQuestion}
        onSubmit={() => {
          setReviewOpen(false);
          setSubmitDialogOpen(true);
        }}
      />

      <SubmitConfirmationDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        totalQuestions={sortedQuestions.length}
        answeredCount={answeredCount}
        flaggedCount={flags.size}
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
