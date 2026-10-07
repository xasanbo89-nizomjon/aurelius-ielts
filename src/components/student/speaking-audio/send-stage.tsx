"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Download, Loader2, RotateCcw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { finalizeSpeakingAudioPracticeAction, refreshSpeakingAudioUploadAction, startSpeakingAudioPracticeAction } from "@/actions/speaking-audio.actions";
import { UploadError, uploadToSignedUrl, type UploadProgress } from "@/lib/uploads/supabase-browser";
import { sizeText } from "@/lib/speaking-audio/format";
import type { PracticePrompt } from "@/lib/speaking-audio/studio-types";
import type { StageRecording } from "@/components/student/speaking-audio/record-stage";

/**
 * Phase Q-B, step 4 - sending the recording. Three things happen, one after the other, and the screen says which:
 *
 *   1. the server is asked to start the practice (it checks the daily limit and gives out a one-time upload link to a PRIVATE storage bucket),
 *   2. the browser uploads the recording straight to that storage with a progress bar (3 tries, gives up on a dead connection after 45 seconds),
 *   3. the server is told it arrived (it looks for the file itself) and the assessment starts in the background.
 *
 * Whatever goes wrong, the recording stays in this page until it has been sent: "Try again" repeats only what is missing (it asks for a fresh link first - the old one
 * is used up), and "Download my recording" keeps a copy even if nothing else works. The student can leave once the last step is done - the result is kept for them.
 */

type Phase = "preparing" | "uploading" | "confirming" | "failed";
type FailedAt = "start" | "upload" | "confirm";
type Failure = { message: string; canRetry: boolean; kind: "retry" | "limit" | "premium" | "fatal"; at: FailedAt };
type Ticket = { bucket: string; path: string; token: string; contentType: string };

/** Whether the same step can be tried again: not when the server has said no on purpose (the day's limit, a Premium feature, a recording that cannot be used, a practice that is not there). */
const retryable = (code: string | undefined) => !["LIMIT", "PREMIUM", "INVALID", "NOT_FOUND"].includes(code ?? "");

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const NETWORK_MESSAGE = "Could not reach the server. Check your connection and try again - your recording is safe on this page.";

export function SendStage({ prompt, state, onBack, onSent }: { prompt: PracticePrompt; state: StageRecording; onBack: () => void; onSent?: () => void }) {
  const router = useRouter();
  const { recording, notes } = state;
  const [phase, setPhase] = useState<Phase>("preparing");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const startRef = useRef<ReturnType<typeof startSpeakingAudioPracticeAction> | null>(null);
  const practiceIdRef = useRef<string | null>(null);
  const ticketRef = useRef<Ticket | null>(null);
  const needFreshLinkRef = useRef(false);
  const sentRef = useRef(false);
  // The parent's callback is read when it is needed; it must never restart the sending by changing identity.
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;

  useEffect(() => {
    const url = URL.createObjectURL(recording.blob);
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recording.blob]);

  // Not while it is on its way: closing the page now would lose the recording.
  useEffect(() => {
    if (phase === "failed") return;
    const warn = (event: BeforeUnloadEvent) => {
      if (sentRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const run = useCallback(
    async (signal: AbortSignal) => {
      const fail = (next: Failure) => {
        if (signal.aborted) return;
        setFailure(next);
        setPhase("failed");
      };
      setFailure(null);
      setProgress(null);
      setPhase("preparing");

      // ---- 1. the practice exists on the server (once), and the upload link is fresh
      if (!practiceIdRef.current) {
        startRef.current ??= startSpeakingAudioPracticeAction({
          part: prompt.part,
          source: prompt.source,
          topicId: prompt.topicId,
          questionId: prompt.questionId,
          question: prompt.question,
          cueCardPoints: prompt.cueCardPoints,
          notes: prompt.part === 2 ? notes : null,
          feedbackLanguage: prompt.feedbackLanguage,
          durationSeconds: recording.seconds,
          bytes: recording.bytes,
        });
        let started;
        try {
          started = await startRef.current;
        } catch {
          startRef.current = null;
          return fail({ message: NETWORK_MESSAGE, canRetry: true, kind: "retry", at: "start" });
        }
        if (signal.aborted) return;
        if (!started.success) {
          startRef.current = null;
          return fail({ message: started.error, canRetry: retryable(started.code), kind: started.code === "LIMIT" ? "limit" : started.code === "PREMIUM" ? "premium" : retryable(started.code) ? "retry" : "fatal", at: "start" });
        }
        practiceIdRef.current = started.practiceId;
        ticketRef.current = started.upload;
        needFreshLinkRef.current = false;
      } else if (needFreshLinkRef.current) {
        try {
          const fresh = await refreshSpeakingAudioUploadAction(practiceIdRef.current);
          if (signal.aborted) return;
          if (!fresh.success) return fail({ message: fresh.error, canRetry: retryable(fresh.code), kind: retryable(fresh.code) ? "retry" : "fatal", at: "start" });
          ticketRef.current = fresh.upload;
          needFreshLinkRef.current = false;
        } catch {
          return fail({ message: NETWORK_MESSAGE, canRetry: true, kind: "retry", at: "start" });
        }
      }
      const practiceId = practiceIdRef.current as string;

      // ---- 2. the recording goes to storage (no ticket = it is already there)
      const ticket = ticketRef.current;
      if (ticket) {
        setPhase("uploading");
        const file = new File([recording.blob], `${practiceId}.wav`, { type: "audio/wav" });
        try {
          await uploadToSignedUrl(ticket.bucket, ticket.path, ticket.token, file, ticket.contentType, { onProgress: setProgress, signal });
        } catch (error) {
          if (error instanceof UploadError && error.kind === "cancelled") return;
          needFreshLinkRef.current = true;
          return fail({ message: error instanceof Error ? error.message : "The upload failed.", canRetry: true, kind: "retry", at: "upload" });
        }
        ticketRef.current = null;
      }
      if (signal.aborted) return;

      // ---- 3. the server is told it has arrived (a dropped connection here is retried: the file is already safe)
      setPhase("confirming");
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await finalizeSpeakingAudioPracticeAction(practiceId);
          if (signal.aborted) return;
          if (result.success) {
            sentRef.current = true;
            onSentRef.current?.();
            router.push(`/student/speaking-practice/record/${practiceId}`);
            return;
          }
          const missing = result.code === "AUDIO_MISSING";
          if (missing) needFreshLinkRef.current = true;
          return fail({ message: result.error, canRetry: retryable(result.code), kind: result.code === "LIMIT" ? "limit" : retryable(result.code) ? "retry" : "fatal", at: "confirm" });
        } catch {
          if (attempt === 3) return fail({ message: NETWORK_MESSAGE, canRetry: true, kind: "retry", at: "confirm" });
          await wait(1500 * attempt);
        }
      }
    },
    [prompt, notes, recording, router]
  );

  // Starts by itself when the screen opens. The second run of a development double-mount finds the first one's request (the same promise) and does not repeat it.
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    void run(controller.signal);
    return () => controller.abort();
  }, [run]);

  function retry() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    void run(controller.signal);
  }

  function cancel() {
    controllerRef.current?.abort();
    onBack();
  }

  const percent = progress?.percent ?? 0;
  const speed = progress?.speedBytesPerSecond ? `${sizeText(progress.speedBytesPerSecond)}/s` : null;
  const failedAt = failure?.at ?? null;

  return (
    <div className="space-y-5" data-testid="send-stage" data-phase={phase}>
      <div className="space-y-1.5">
        <h2 className="font-display text-lg font-medium">Sending your answer</h2>
        <p className="text-muted-foreground text-sm">Keep this page open until the last step is done. Your recording stays on this page until it has been sent.</p>
      </div>

      <ol className="border-border bg-card space-y-3 rounded-2xl border p-5 text-sm" aria-label="Steps">
        <Step label="Getting ready" state={phase === "preparing" ? "active" : failedAt === "start" ? "failed" : "done"} />
        <Step
          label={phase === "uploading" ? `Uploading your recording - ${percent}%${speed ? ` (${speed})` : ""}` : "Uploading your recording"}
          state={phase === "preparing" || failedAt === "start" ? "todo" : phase === "uploading" ? "active" : failedAt === "upload" ? "failed" : "done"}
        >
          {phase === "uploading" && progress && (
            <div className="mt-2 space-y-1">
              <div className="bg-secondary h-2 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Upload progress" data-testid="upload-bar">
                <div className="bg-accent h-full rounded-full transition-[width] duration-200" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-muted-foreground text-xs" data-testid="upload-state">
                {progress.state === "waiting-to-retry"
                  ? `The connection was lost (${progress.lastError ?? "no answer"}). Trying again - attempt ${progress.attempt} of ${progress.attempts}...`
                  : progress.state === "finishing"
                    ? "Almost there - waiting for the storage to confirm..."
                    : `${sizeText(progress.loaded)} of ${sizeText(progress.total)} - attempt ${progress.attempt} of ${progress.attempts}`}
              </p>
            </div>
          )}
        </Step>
        <Step label="Confirming - the AI assessment starts" state={phase === "confirming" ? "active" : failedAt === "confirm" ? "failed" : "todo"} />
      </ol>

      {failure && (
        <div role="alert" className="border-destructive/30 bg-destructive/5 space-y-3 rounded-2xl border p-4 text-sm" data-testid="send-error" data-kind={failure.kind} data-at={failure.at}>
          <p className="text-destructive flex items-start gap-2 font-medium">
            <WifiOff className="mt-0.5 size-4 shrink-0" /> {failure.message}
          </p>
          <div className="flex flex-wrap gap-2">
            {failure.canRetry && (
              <Button size="sm" onClick={retry} data-testid="send-retry">
                <RotateCcw className="size-4" /> Try again
              </Button>
            )}
            {failure.kind === "premium" && (
              <Button size="sm" asChild>
                <Link href="/student/premium">See Premium</Link>
              </Button>
            )}
            {failure.kind === "limit" && (
              <Button size="sm" variant="outline" asChild>
                <Link href="/student/speaking-practice/recordings">My recordings</Link>
              </Button>
            )}
            {downloadUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={downloadUrl} download="my-speaking-answer.wav" data-testid="send-download">
                  <Download className="size-4" /> Download my recording
                </a>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={cancel} data-testid="send-back">
              <ArrowLeft className="size-4" /> Back to my recording
            </Button>
          </div>
        </div>
      )}

      {!failure && (
        <div>
          <Button variant="ghost" size="sm" onClick={cancel} data-testid="send-cancel">
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function Step({ label, state, children }: { label: string; state: "todo" | "active" | "done" | "failed"; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-3" data-state={state}>
      <span className="mt-0.5 shrink-0">
        {state === "done" ? (
          <CheckCircle2 className="text-success size-4" />
        ) : state === "active" ? (
          <Loader2 className="text-accent size-4 animate-spin" />
        ) : state === "failed" ? (
          <WifiOff className="text-destructive size-4" />
        ) : (
          <span className="bg-border block size-3.5 rounded-full" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={state === "todo" ? "text-muted-foreground" : "font-medium"}>{label}</span>
        {children}
      </span>
    </li>
  );
}
