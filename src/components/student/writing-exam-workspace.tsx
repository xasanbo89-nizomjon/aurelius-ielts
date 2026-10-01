"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Home, Loader2, Maximize2, Minimize2, Target } from "lucide-react";
import { toast } from "sonner";

import { saveDraftAction, submitEssayAction } from "@/actions/writing.actions";
import type { AssignedWritingTask } from "@/lib/writing-tasks";
import type { DraftForEdit } from "@/lib/ai/writing";
import { WRITING_TASK_CATEGORY_LABELS, WRITING_TASK_NUMBER_LABELS, WRITING_TRAINING_TYPE_LABELS } from "@/lib/labels";
import { useStudyHeartbeat } from "@/hooks/use-study-heartbeat";
import { ExamTimer } from "@/components/exam/exam-timer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { WritingSubmitReviewDialog } from "@/components/student/writing-submit-review-dialog";
import { FallbackImage } from "@/components/ui/fallback-image";

/** Real IELTS convention: Task 1 = 20 minutes, Task 2 = 40 minutes. Purely a visible countdown — never force-submits, since an essay submission must always be a deliberate student action. */
const TASK_DURATION_SECONDS: Record<AssignedWritingTask["taskNumber"], number> = {
  TASK_1: 20 * 60,
  TASK_2: 40 * 60,
};

/** Phase 42 — Part 4's real IELTS word-count minimums. */
const MIN_WORDS: Record<AssignedWritingTask["taskNumber"], number> = {
  TASK_1: 150,
  TASK_2: 250,
};

const AUTOSAVE_DEBOUNCE_MS = 1200;

/**
 * Phase 40 — Writing Exam Mode. Lives under the (exam) route group (no
 * dashboard chrome). Same real saveDraftAction/submitEssayAction as before,
 * just driven by autosave instead of a manual Save button (rule 6: "No Save
 * button required"). The timer is a visible-only countdown — Writing has
 * never been server-enforced timed, and forcing a submit on expiry would risk
 * submitting an unfinished essay through a side effect nobody asked for.
 */
export function WritingExamWorkspace({ task, draft }: { task: AssignedWritingTask; draft: DraftForEdit | null }) {
  const router = useRouter();
  useStudyHeartbeat("WRITING");

  const [content, setContent] = useState(draft?.content ?? "");
  const [submissionId, setSubmissionId] = useState(draft?.id ?? null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(draft ? "saved" : "idle");
  const [submitting, setSubmitting] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const minWords = MIN_WORDS[task.taskNumber];

  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef(draft?.content ?? "");
  const submissionIdRef = useRef(submissionId);
  submissionIdRef.current = submissionId;

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  const timerStorageKey = `writing-timer-start:${draft?.id ?? task.id}`;
  const initialRemainingSeconds = useMemo(() => {
    const totalSeconds = TASK_DURATION_SECONDS[task.taskNumber];
    try {
      const stored = localStorage.getItem(timerStorageKey);
      const startedAtMs = stored ? Number(stored) : Date.now();
      if (!stored) localStorage.setItem(timerStorageKey, String(startedAtMs));
      const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
      return Math.max(0, totalSeconds - elapsed);
    } catch {
      return totalSeconds;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function scheduleAutosave(nextContent: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = setTimeout(async () => {
      if (nextContent === lastSavedContentRef.current) {
        setSaveState("saved");
        return;
      }
      const result = await saveDraftAction({ submissionId: submissionIdRef.current ?? undefined, taskId: task.id, content: nextContent });
      if (!result.success) {
        setSaveState("idle");
        toast.error(result.error);
        return;
      }
      lastSavedContentRef.current = nextContent;
      setSaveState("saved");
      if (!submissionIdRef.current) {
        setSubmissionId(result.submissionId);
        router.replace(`/student/writing/new?draftId=${result.submissionId}`, { scroll: false });
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function handleContentChange(value: string) {
    setContent(value);
    scheduleAutosave(value);
  }

  async function toggleFocusMode() {
    const next = !focusMode;
    setFocusMode(next);
    try {
      if (next) await containerRef.current?.requestFullscreen?.();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Fullscreen is a best-effort enhancement — the large editor still works even if the browser refuses it.
    }
  }

  function openReview() {
    if (content.trim().length < 50) {
      toast.error("Your response should be at least 50 characters.");
      return;
    }
    setReviewOpen(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const result = await submitEssayAction({ submissionId: submissionId ?? undefined, taskId: task.id, content });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    try {
      localStorage.removeItem(timerStorageKey);
    } catch {
      // best-effort cleanup only
    }

    if (result.analysisWarning) {
      toast.warning(result.analysisWarning);
    } else {
      toast.success("Submitted — your AI analysis is ready.");
    }
    router.push(`/student/writing/${result.submissionId}`);
  }

  return (
    <div ref={containerRef} className="bg-background flex h-svh flex-col">
      <header className="border-border/70 flex h-16 shrink-0 items-center gap-2 border-b px-4 sm:gap-3 sm:px-6">
        <Button variant="ghost" size="icon" aria-label="Back to writing tasks" asChild>
          <Link href="/student/writing/tasks">
            <Home className="size-4.5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-base font-medium sm:text-lg">IELTS Writing — {WRITING_TASK_NUMBER_LABELS[task.taskNumber]}</h1>
        </div>
        {saveState !== "idle" && (
          <span className="text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex">
            {saveState === "saving" ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Saving…
              </>
            ) : (
              "Saved"
            )}
          </span>
        )}
        <span className="hidden items-center gap-1.5 text-xs tabular-nums sm:flex">
          <span className="text-muted-foreground">{wordCount} words</span>
          <span className={wordCount >= minWords ? "text-success font-medium" : "text-muted-foreground"}>
            {wordCount >= minWords ? "· Minimum Reached" : `· Below Minimum (${minWords})`}
          </span>
        </span>
        <ExamTimer durationSeconds={initialRemainingSeconds} onExpire={() => setTimeUp(true)} />
        <Button
          variant="outline"
          size="sm"
          className="hidden lg:inline-flex"
          onClick={toggleFocusMode}
          aria-pressed={focusMode}
          aria-label={focusMode ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        <Button size="sm" onClick={openReview} disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Submit
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
        {timeUp && (
          <div className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm font-medium">
            Time&apos;s up — you can keep writing, but submit when you&apos;re ready.
          </div>
        )}

        <div className="border-border/70 shrink-0 space-y-2 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-medium tracking-tight">{task.title}</h2>
            <Badge variant="outline">{WRITING_TRAINING_TYPE_LABELS[task.trainingType]}</Badge>
            <Badge variant="outline">{WRITING_TASK_CATEGORY_LABELS[task.category]}</Badge>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.prompt}</p>
          {task.imageUrl && (
            <div className="bg-secondary relative aspect-video w-full max-w-md overflow-hidden rounded-lg">
              <FallbackImage src={task.imageUrl} alt="Task 1 visual" fill sizes="480px" className="object-contain" unoptimized />
            </div>
          )}
          {task.visualDescription && <p className="text-muted-foreground text-xs">Visual: {task.visualDescription}</p>}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3.5" aria-hidden="true" /> Due {task.dueDate.toLocaleDateString()}
              </span>
            )}
            {task.targetBand != null && (
              <span className="flex items-center gap-1">
                <Target className="size-3.5" aria-hidden="true" /> Target band {task.targetBand.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        <Textarea
          id="content"
          placeholder="Write your response here…"
          value={content}
          onChange={(event) => handleContentChange(event.target.value)}
          className="min-h-0 flex-1 resize-none text-base leading-relaxed"
        />
        <span className="flex items-center gap-1.5 text-xs tabular-nums sm:hidden">
          <span className="text-muted-foreground">{wordCount} words</span>
          <span className={wordCount >= minWords ? "text-success font-medium" : "text-muted-foreground"}>
            {wordCount >= minWords ? "· Minimum Reached" : `· Below Minimum (${minWords})`}
          </span>
        </span>
      </div>

      <WritingSubmitReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        taskLabel={WRITING_TASK_NUMBER_LABELS[task.taskNumber]}
        wordCount={wordCount}
        minWords={minWords}
        submitting={submitting}
        onConfirm={handleSubmit}
      />
    </div>
  );
}
