"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { QuestionType } from "@prisma/client";
import { ChevronLeft, ChevronRight, Flag, List, Loader2, NotebookPen } from "lucide-react";
import { toast } from "sonner";

import {
  addHighlightAction,
  deleteNoteAction,
  removeHighlightAction,
  saveAnswerAction,
  saveNoteAction,
  submitAttemptAction,
  toggleFlagAction,
} from "@/actions/exam.actions";
import { cn } from "@/lib/utils";
import { isResponseAnswered } from "@/lib/exam/grading";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ExamTimer } from "@/components/exam/exam-timer";
import { QuestionNavigator, type NavigatorQuestionState } from "@/components/exam/question-navigator";
import { SubmitConfirmationDialog } from "@/components/exam/submit-confirmation-dialog";
import { PassagePanel } from "@/components/exam/passage-panel";
import { NotesDrawer, type ExamNote } from "@/components/exam/notes-drawer";
import { AudioPlayer } from "@/components/exam/audio-player";
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
};

export type ExamHighlight = { id: string; passageId: string; text: string; startOffset: number; endOffset: number };
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
  initialHighlights,
  initialNotes,
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
  initialHighlights: ExamHighlight[];
  initialNotes: ExamNoteRecord[];
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [flags, setFlags] = useState<Set<string>>(() => new Set(initialFlags));
  const [highlights, setHighlights] = useState<ExamHighlight[]>(initialHighlights);
  const [notes, setNotes] = useState<ExamNoteRecord[]>(initialNotes);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, startSubmitTransition] = useTransition();
  const [pendingSaves, setPendingSaves] = useState(0);

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

  const answeredCount = navigatorItems.filter((item) => item.answered).length;

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

  function goToQuestion(questionId: string) {
    const question = sortedQuestions.find((q) => q.id === questionId);
    if (!question) return;
    const targetSection = sortedPassages.findIndex((p) => p.id === question.passageId);
    if (targetSection >= 0 && targetSection !== sectionIndex) setSectionIndex(targetSection);
    setNavOpen(false);
    requestAnimationFrame(() => {
      document.getElementById(`question-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function handleHighlight(text: string, start: number, end: number) {
    if (!currentPassage) return;
    const passageId = currentPassage.id;
    const result = await addHighlightAction(resultId, { passageId, text, startOffset: start, endOffset: end });
    if (result.success && result.highlightId) {
      setHighlights((prev) => [...prev, { id: result.highlightId!, passageId, text, startOffset: start, endOffset: end }]);
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
          return (
            <div key={question.id} id={`question-${question.id}`} className="scroll-mt-24 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground mr-1.5">{number}.</span>
                  {question.prompt}
                </p>
                <button
                  type="button"
                  onClick={() => handleToggleFlag(question.id)}
                  aria-pressed={flagged}
                  aria-label={flagged ? `Remove flag from question ${number}` : `Flag question ${number} for review`}
                  className={cn(
                    "focus-visible:ring-ring/50 shrink-0 rounded-md p-1.5 outline-none focus-visible:ring-2",
                    flagged ? "text-accent" : "text-muted-foreground hover:text-accent"
                  )}
                >
                  <Flag className={cn("size-4", flagged && "fill-current")} />
                </button>
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
    <div className="bg-background flex h-svh flex-col">
      <header className="border-border/70 flex h-16 shrink-0 items-center gap-2 border-b px-4 sm:gap-3 sm:px-6">
        <h1 className="font-display min-w-0 flex-1 truncate text-base font-medium sm:text-lg">{testTitle}</h1>
        {pendingSaves > 0 && (
          <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex">
            <Loader2 className="size-3 animate-spin" /> Saving…
          </span>
        )}
        <ExamTimer durationSeconds={initialRemainingSeconds} onExpire={handleExpire} />
        {testType === "READING" && (
          <Button variant="outline" size="sm" onClick={() => setNotesOpen(true)}>
            <NotebookPen className="size-4" />
            <span className="hidden sm:inline">Notes</span>
          </Button>
        )}
        <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setNavOpen(true)}>
          <List className="size-4" />
          <span className="hidden sm:inline">Questions</span>
        </Button>
        <Button size="sm" onClick={() => setSubmitDialogOpen(true)}>
          Submit
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {testType === "READING" ? (
          <>
            <div className="border-border/70 hidden w-1/2 overflow-hidden border-r lg:block">
              {currentPassage && (
                <PassagePanel
                  title={currentPassage.title}
                  content={currentPassage.content}
                  highlights={currentPassageHighlights}
                  onHighlight={handleHighlight}
                  onRemoveHighlight={handleRemoveHighlight}
                  onAddNote={handleAddNoteFromSelection}
                />
              )}
            </div>
            <div className="flex-1 overflow-y-auto lg:w-1/2">
              <div className="lg:hidden">
                {currentPassage && (
                  <PassagePanel
                    title={currentPassage.title}
                    content={currentPassage.content}
                    highlights={currentPassageHighlights}
                    onHighlight={handleHighlight}
                    onRemoveHighlight={handleRemoveHighlight}
                    onAddNote={handleAddNoteFromSelection}
                  />
                )}
                <div className="border-border/70 border-t" />
              </div>
              <div className="px-6 py-6 sm:px-8 sm:py-8">{questionsList}</div>
            </div>
          </>
        ) : (
          <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
            {currentPassage?.audioUrl && (
              <div className="mb-6">
                <AudioPlayer src={currentPassage.audioUrl} label={currentPassage.title} />
              </div>
            )}
            {questionsList}
          </div>
        )}

        <aside className="border-border/70 hidden w-72 shrink-0 overflow-y-auto border-l p-5 lg:block">
          <QuestionNavigator
            questions={navigatorItems}
            currentQuestionId={currentQuestions[0]?.id ?? ""}
            onSelect={goToQuestion}
          />
        </aside>
      </div>

      <footer className="border-border/70 flex h-16 shrink-0 items-center justify-between border-t px-4 sm:px-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSectionIndex((i) => Math.max(0, i - 1))}
          disabled={sectionIndex === 0}
        >
          <ChevronLeft className="size-4" /> Previous
        </Button>
        <span className="text-muted-foreground text-sm">
          Section {sectionIndex + 1} of {sortedPassages.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSectionIndex((i) => Math.min(sortedPassages.length - 1, i + 1))}
          disabled={sectionIndex >= sortedPassages.length - 1}
        >
          Next <ChevronRight className="size-4" />
        </Button>
      </footer>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="right">
          <SheetHeader className="border-b">
            <SheetTitle>Questions</SheetTitle>
            <SheetDescription className="sr-only">Jump to any question</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto p-5">
            <QuestionNavigator
              questions={navigatorItems}
              currentQuestionId={currentQuestions[0]?.id ?? ""}
              onSelect={goToQuestion}
            />
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

      <SubmitConfirmationDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        totalQuestions={sortedQuestions.length}
        answeredCount={answeredCount}
        flaggedCount={flags.size}
        submitting={submitting}
        onConfirm={handleSubmit}
      />
    </div>
  );
}
