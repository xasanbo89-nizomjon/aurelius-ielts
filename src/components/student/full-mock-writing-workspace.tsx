"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Home, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveFullMockWritingDraftAction, submitFullMockWritingAction } from "@/actions/full-mock-writing.actions";
import { cn } from "@/lib/utils";
import { ExamTimer } from "@/components/exam/exam-timer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FallbackImage } from "@/components/ui/fallback-image";

export type FullMockWritingWorkspaceTask = {
  taskId: string;
  label: string;
  title: string;
  prompt: string;
  imageUrl: string | null;
  visualDescription: string | null;
  minWords: number;
  draftId: string | null;
  content: string;
};

const AUTOSAVE_DEBOUNCE_MS = 700;
const AUTO_SUBMIT_ATTEMPTS = 5;

const countWords = (text: string) => (text.trim().length === 0 ? 0 : text.trim().split(/\s+/).filter(Boolean).length);

/**
 * Phase E — the Writing paper of a Full Mock. Task 1 and Task 2 sit side by
 * side behind two tabs under ONE 60-minute countdown (the real exam gives
 * the hour for both and leaves the split to the candidate). Everything typed
 * is autosaved; reloading the page loses nothing and doesn't touch the clock,
 * because the clock is anchored on the server. When it reaches zero both
 * tasks are handed in automatically — no dialog, no extra clicks — and the
 * student moves on to the results.
 */
export function FullMockWritingWorkspace({
  attemptId,
  fullMockTitle,
  remainingSeconds,
  tasks,
}: {
  attemptId: string;
  fullMockTitle: string;
  remainingSeconds: number;
  tasks: FullMockWritingWorkspaceTask[];
}) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(tasks.map((t) => [t.taskId, t.content])));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const textsRef = useRef(texts);
  textsRef.current = texts;
  const draftIds = useRef<Record<string, string | null>>(Object.fromEntries(tasks.map((t) => [t.taskId, t.draftId])));
  const lastSaved = useRef<Record<string, string>>(Object.fromEntries(tasks.map((t) => [t.taskId, t.content])));
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** Saves of one task run strictly one after another, so a fast typist can never create two drafts of the same task. */
  const saveChains = useRef<Record<string, Promise<unknown>>>({});
  const submittingRef = useRef(false);
  const timeUpRef = useRef(false);

  const active = tasks[activeIndex];

  const saveTask = useCallback(
    (taskId: string): Promise<unknown> => {
      const chain = (saveChains.current[taskId] ?? Promise.resolve()).then(async () => {
        const latest = textsRef.current[taskId] ?? "";
        if (latest === lastSaved.current[taskId]) return;
        setSaveState("saving");
        const result = await saveFullMockWritingDraftAction(attemptId, { taskId, content: latest, submissionId: draftIds.current[taskId] });
        if (result.success) {
          draftIds.current[taskId] = result.submissionId;
          lastSaved.current[taskId] = latest;
          setSaveState("saved");
        } else if (!result.timeUp) {
          setSaveState("idle");
          toast.error(result.error);
        }
      });
      saveChains.current[taskId] = chain.catch(() => undefined);
      return chain;
    },
    [attemptId]
  );

  function handleChange(taskId: string, value: string) {
    setTexts((prev) => ({ ...prev, [taskId]: value }));
    setSaveState("saving");
    clearTimeout(debounceTimers.current[taskId]);
    // textsRef is updated on the next render; the timer reads it when it fires, by which time it holds this value.
    debounceTimers.current[taskId] = setTimeout(() => void saveTask(taskId), AUTOSAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (!submittingRef.current) event.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  /** Hands in both tasks. `automatic` (the clock hit zero) retries on a network failure instead of asking the student, since there is nobody to ask. */
  const submitAll = useCallback(
    async (automatic: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setConfirmOpen(false);
      Object.values(debounceTimers.current).forEach(clearTimeout);

      const payload = tasks.map((t) => ({ taskId: t.taskId, content: textsRef.current[t.taskId] ?? "" }));
      for (let attempt = 1; attempt <= (automatic ? AUTO_SUBMIT_ATTEMPTS : 1); attempt++) {
        try {
          const result = await submitFullMockWritingAction(attemptId, payload);
          if (result.success) {
            router.replace(`/student/full-mock/attempt/${attemptId}`);
            return;
          }
          if (!automatic) toast.error(result.error);
        } catch {
          if (!automatic) toast.error("Could not submit your writing. Check your connection and try again.");
        }
        if (automatic) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
      submittingRef.current = false;
      setSubmitting(false);
    },
    [attemptId, router, tasks]
  );

  const handleExpire = useCallback(() => {
    if (timeUpRef.current) return;
    timeUpRef.current = true;
    toast.info("Time's up — submitting your writing.");
    void submitAll(true);
  }, [submitAll]);

  return (
    <div className="bg-background flex h-svh flex-col">
      <header className="border-border/70 grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Leave and go home" asChild>
            <Link href="/student/dashboard">
              <Home className="size-4.5" />
            </Link>
          </Button>
          <h1 className="font-display hidden min-w-0 truncate text-base font-medium sm:block sm:text-lg">{fullMockTitle} · Writing</h1>
        </div>
        <div className="justify-self-center">
          <ExamTimer size="large" durationSeconds={remainingSeconds} onExpire={handleExpire} />
        </div>
        <div className="flex items-center justify-end gap-2">
          {saveState !== "idle" && (
            <span data-testid="writing-save-state" className="text-muted-foreground hidden items-center gap-1.5 text-xs md:flex">
              {saveState === "saving" ? (
                <>
                  <Loader2 className="size-3 animate-spin" /> Saving…
                </>
              ) : (
                "Saved"
              )}
            </span>
          )}
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={submitting} data-testid="writing-submit">
            Submit
          </Button>
        </div>
      </header>

      <div role="tablist" aria-label="Writing tasks" className="border-border/70 flex shrink-0 gap-2 border-b px-3 py-2 sm:px-6">
        {tasks.map((task, index) => {
          const words = countWords(texts[task.taskId] ?? "");
          const reached = words >= task.minWords;
          return (
            <button
              key={task.taskId}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "focus-visible:ring-ring/50 flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium outline-none focus-visible:ring-2",
                index === activeIndex ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"
              )}
            >
              {task.label}
              <span className={cn("text-xs tabular-nums", index === activeIndex ? "opacity-80" : reached ? "text-success" : "text-muted-foreground")}>
                {words}/{task.minWords}
              </span>
              {reached && <CheckCircle2 className={cn("size-3.5", index === activeIndex ? "" : "text-success")} aria-label="Minimum word count reached" />}
            </button>
          );
        })}
        <p className="text-muted-foreground ml-auto hidden self-center text-xs md:block">One 60-minute timer for both tasks — Task 1 is suggested at 20 minutes, Task 2 at 40.</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-4 overflow-hidden p-3 sm:p-5 lg:grid-cols-2 lg:grid-rows-1">
        <section aria-label={`${active.label} question`} className="border-border/70 max-h-60 space-y-3 overflow-y-auto rounded-xl border p-4 lg:max-h-none">
          <h2 className="font-display text-base font-medium tracking-tight">
            {active.label}
            {active.title ? <span className="text-muted-foreground font-normal"> — {active.title}</span> : null}
          </h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{active.prompt}</p>
          {active.imageUrl && (
            <div className="bg-secondary relative aspect-video w-full max-w-lg overflow-hidden rounded-lg">
              <FallbackImage src={active.imageUrl} alt={`${active.label} visual`} fill sizes="560px" className="object-contain" unoptimized />
            </div>
          )}
          {active.visualDescription && <p className="text-muted-foreground text-xs">Visual: {active.visualDescription}</p>}
        </section>

        <section aria-label={`${active.label} response`} className="flex min-h-0 flex-col gap-2">
          <Textarea
            key={active.taskId}
            data-testid={`writing-editor-${active.label.replace(/\s+/g, "-").toLowerCase()}`}
            aria-label={`${active.label} response`}
            placeholder={`Write your ${active.label} response here…`}
            value={texts[active.taskId] ?? ""}
            onChange={(event) => handleChange(active.taskId, event.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            disabled={submitting}
            className="min-h-0 flex-1 resize-none text-base leading-relaxed"
          />
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
            <span data-testid="writing-word-count">{countWords(texts[active.taskId] ?? "")} words</span>
            <span className={countWords(texts[active.taskId] ?? "") >= active.minWords ? "text-success font-medium" : ""}>
              {countWords(texts[active.taskId] ?? "") >= active.minWords ? "· Minimum reached" : `· Minimum ${active.minWords}`}
            </span>
          </p>
        </section>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your writing?</DialogTitle>
            <DialogDescription>Both tasks are handed in together and you can&apos;t change them afterwards.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm">
            {tasks.map((task) => {
              const words = countWords(texts[task.taskId] ?? "");
              return (
                <li key={task.taskId} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{task.label}</span>
                  <span className={cn("tabular-nums", words >= task.minWords ? "text-success" : "text-destructive")}>
                    {words} words{words >= task.minWords ? "" : ` · below the ${task.minWords}-word minimum`}
                  </span>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep writing
            </Button>
            <Button onClick={() => void submitAll(false)} data-testid="writing-confirm-submit">
              Submit writing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {submitting && (
        <div role="status" data-testid="writing-submitting" className="bg-background/95 fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 text-center backdrop-blur-sm">
          <Loader2 className="text-accent size-8 animate-spin" aria-hidden="true" />
          <p className="font-display text-xl font-medium">Submitting your writing…</p>
          <p className="text-muted-foreground max-w-xs text-sm">Both tasks are being saved and marked. Please keep this page open for a few seconds.</p>
        </div>
      )}
    </div>
  );
}
