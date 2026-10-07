"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Mic, MicOff, RotateCcw, Send, Square, Timer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LevelMeter } from "@/components/student/speaking-audio/level-meter";
import { cn } from "@/lib/utils";
import { MAX_NOTES_CHARS, MAX_RECORDING_SECONDS, MIN_RECORDING_SECONDS, PART2_PREPARATION_SECONDS, PART_GUIDE } from "@/lib/speaking-audio/constants";
import { describeMicError, SILENT_PEAK_THRESHOLD, SILENT_RECORDING_MESSAGE, type MicProblem } from "@/lib/speaking-audio/mic-errors";
import { encodeCapture, keepScreenAwake, openMicrophone, startPcmRecorder, type EncodedRecording, type MicSession, type PcmRecorder } from "@/lib/speaking-audio/recorder";
import { clock, sizeText } from "@/lib/speaking-audio/format";
import type { PracticePrompt } from "@/lib/speaking-audio/studio-types";

/**
 * Phase Q-B, step 3 - the recording itself.
 *
 *   Part 1 / 3   press Record, answer (the screen suggests a length), press Stop. At most 2 minutes: the recorder stops by itself.
 *   Part 2       press "Start preparation": one minute to think, with a notes box; when it ends the recording starts by itself (or press "Start speaking now"), and
 *                it stops by itself after 2 minutes.
 *
 * Then listen back, record again as often as you like, and send. The length of a recording is the number of samples captured (not a timer), so a slow or throttled
 * page can never record more or less than it shows. The microphone is released the moment the recording ends.
 */

type Phase = "ready" | "opening" | "preparing" | "recording" | "review";

export type StageRecording = { recording: EncodedRecording; notes: string };

export function RecordStage({
  prompt,
  initial,
  onRecorded,
  onSend,
  onBack,
}: {
  prompt: PracticePrompt;
  initial: StageRecording | null;
  /** The finished recording (or null when it was thrown away) and the preparation notes, so the screen that sends it can hold on to them. */
  onRecorded: (state: StageRecording | null) => void;
  onSend: (state: StageRecording) => void;
  onBack: () => void;
}) {
  const isPart2 = prompt.part === 2;
  const [phase, setPhase] = useState<Phase>(initial ? "review" : "ready");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [recording, setRecording] = useState<EncodedRecording | null>(initial?.recording ?? null);
  const [problem, setProblem] = useState<MicProblem | null>(null);
  const [prepEndsAt, setPrepEndsAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [url, setUrl] = useState<string | null>(() => (initial ? URL.createObjectURL(initial.recording.blob) : null));

  const sessionRef = useRef<MicSession | null>(null);
  const recorderRef = useRef<PcmRecorder | null>(null);
  const finishingRef = useRef(false);
  const startedAtRef = useRef(0);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const urlRef = useRef<string | null>(url);
  urlRef.current = url;

  const getLevel = useCallback(() => sessionRef.current?.level() ?? 0, []);

  const release = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  useEffect(
    () => () => {
      release();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [release]
  );

  // The browser started the recording but delivers no sound at all (an audio context that never started - it happens on phones after another app took the
  // microphone): nothing would ever be recorded, so the student is told and can start again.
  const noSound = useCallback(() => {
    release();
    setPhase("ready");
    setProblem({
      code: "unknown",
      message: "Your browser is not delivering any sound to this page, so nothing was recorded.",
      steps: ["Check that the microphone is not muted and that no other app or tab is using it.", "Close other apps that use the microphone (video calls, voice notes), then press Start again.", "If it keeps happening, reload this page."],
    });
  }, [release]);

  // A once-a-quarter-second heartbeat while something is counting (the preparation, the recording); nothing ticks otherwise.
  useEffect(() => {
    if (phase !== "preparing" && phase !== "recording") return;
    const interval = setInterval(() => {
      setTick((value) => value + 1);
      if (phase === "recording" && recorderRef.current && performance.now() - startedAtRef.current > 3000 && recorderRef.current.seconds() < 0.3) noSound();
    }, 250);
    return () => clearInterval(interval);
  }, [phase, noSound]);

  // While the student prepares or speaks the screen is kept on (a locked phone stops recording).
  const awake = phase === "preparing" || phase === "recording";
  useEffect(() => {
    if (!awake) return;
    let letGo: (() => void) | null = null;
    let cancelled = false;
    void keepScreenAwake().then((release) => {
      if (cancelled) release();
      else letGo = release;
    });
    return () => {
      cancelled = true;
      letGo?.();
    };
  }, [awake]);

  // Leaving the page with a recording that has not been sent (or in the middle of one) asks first.
  useEffect(() => {
    if (phase === "ready" || phase === "opening") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const finish = useCallback(() => {
    if (finishingRef.current || !recorderRef.current) return;
    finishingRef.current = true;
    const capture = recorderRef.current.stop();
    recorderRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    const encoded = encodeCapture(capture);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const nextUrl = URL.createObjectURL(encoded.blob);
    setUrl(nextUrl);
    setRecording(encoded);
    setPhase("review");
    onRecorded({ recording: encoded, notes: notesRef.current });
    finishingRef.current = false;
  }, [onRecorded]);

  const beginRecording = useCallback(() => {
    const session = sessionRef.current;
    if (!session || recorderRef.current) return;
    // The audio callback reports the 2-minute limit; the stop itself is done outside it.
    recorderRef.current = startPcmRecorder(session, { maxSeconds: MAX_RECORDING_SECONDS, onLimit: () => setTimeout(finish, 0) });
    startedAtRef.current = performance.now();
    setPhase("recording");
  }, [finish]);

  async function open(next: "preparing" | "recording") {
    setProblem(null);
    setPhase("opening");
    release();
    try {
      sessionRef.current = await openMicrophone({
        onEnded: () => {
          // The microphone vanished (unplugged, taken by another app): what has been recorded so far is kept if it is long enough.
          if (recorderRef.current && recorderRef.current.seconds() >= MIN_RECORDING_SECONDS) {
            finish();
            return;
          }
          release();
          setPhase("ready");
          setProblem({ code: "busy", message: "The microphone was disconnected, so the recording stopped.", steps: ["Plug it in again or choose another microphone, then start again."] });
        },
      });
    } catch (error) {
      setPhase("ready");
      setProblem(describeMicError(error, navigator.userAgent));
      return;
    }
    if (next === "preparing") {
      setPrepEndsAt(Date.now() + PART2_PREPARATION_SECONDS * 1000);
      setPhase("preparing");
    } else {
      beginRecording();
    }
  }

  // The preparation minute ends: the speaking starts by itself.
  const prepLeft = prepEndsAt == null ? PART2_PREPARATION_SECONDS : Math.max(0, Math.ceil((prepEndsAt - Date.now()) / 1000));
  useEffect(() => {
    if (phase === "preparing" && prepEndsAt != null && Date.now() >= prepEndsAt) beginRecording();
  });

  function discard() {
    release();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    setUrl(null);
    setRecording(null);
    setPrepEndsAt(null);
    setPhase("ready");
    onRecorded(null);
  }

  function cancelBeforeEnd() {
    release();
    setPrepEndsAt(null);
    setPhase("ready");
  }

  const elapsed = recorderRef.current?.seconds() ?? 0;
  const guide = PART_GUIDE[prompt.part];
  const silent = recording != null && recording.peak < SILENT_PEAK_THRESHOLD;
  const tooShort = recording != null && recording.seconds < MIN_RECORDING_SECONDS;
  const canSend = recording != null && !silent && !tooShort;

  return (
    <div className="space-y-5" data-testid="record-stage" data-phase={phase}>
      <PromptCard prompt={prompt} />

      {problem && (
        <div role="alert" className="border-destructive/30 bg-destructive/5 space-y-2 rounded-2xl border p-4 text-sm" data-testid="record-problem" data-code={problem.code}>
          <p className="text-destructive flex items-center gap-2 font-medium">
            <MicOff className="size-4 shrink-0" /> {problem.message}
          </p>
          <ol className="text-muted-foreground list-decimal space-y-1 pl-5">
            {problem.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {(phase === "ready" || phase === "opening") && (
        <div className="border-border bg-card space-y-4 rounded-2xl border p-5 text-center">
          {isPart2 ? (
            <p className="text-muted-foreground text-sm">
              You have <strong>1 minute to prepare</strong> and can write notes. Then you speak for <strong>1 to 2 minutes</strong>; the recording stops by itself at 2:00.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Aim for <strong>{guide.suggested}</strong>. You can stop whenever you have finished; the longest recording is 2 minutes.
            </p>
          )}
          <Button size="lg" onClick={() => open(isPart2 ? "preparing" : "recording")} disabled={phase === "opening"} data-testid="record-start">
            {isPart2 ? <Timer className="size-4" /> : <Mic className="size-4" />}
            {phase === "opening" ? "Waiting for the microphone..." : isPart2 ? "Start preparation" : "Start recording"}
          </Button>
        </div>
      )}

      {phase === "preparing" && (
        <div className="space-y-3" data-testid="prep-stage">
          <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Preparation time</p>
              <p role="timer" aria-live="off" className="font-display text-4xl font-medium tabular-nums" data-testid="prep-countdown" data-seconds={prepLeft}>
                {clock(prepLeft)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={cancelBeforeEnd} data-testid="prep-cancel">
                <X className="size-4" /> Cancel
              </Button>
              <Button onClick={beginRecording} data-testid="prep-skip">
                <Mic className="size-4" /> Start speaking now
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="prep-notes" className="text-sm font-medium">
              Your notes (only for you - the AI gets them as context)
            </label>
            <Textarea id="prep-notes" data-testid="prep-notes" value={notes} maxLength={MAX_NOTES_CHARS} rows={5} onChange={(event) => setNotes(event.target.value)} placeholder="Write a few key words, not whole sentences." />
          </div>
          <p className="text-muted-foreground text-xs">When the time is up the recording starts by itself - the microphone is already on.</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="border-border bg-card space-y-4 rounded-2xl border p-5" data-testid="recording-stage">
          {isPart2 && notes.trim() && (
            <div className="bg-secondary/60 rounded-xl p-3 text-sm" data-testid="notes-reminder">
              <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">Your notes</p>
              <p className="whitespace-pre-wrap">{notes}</p>
            </div>
          )}
          <LevelMeter getLevel={getLevel} active />
          <div className="flex flex-col items-center gap-1">
            <p role="timer" aria-live="off" className="font-display text-4xl font-medium tabular-nums" data-testid="record-timer" data-seconds={Math.floor(elapsed)}>
              {clock(elapsed)}
            </p>
            <p className="text-muted-foreground text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="bg-destructive size-2 animate-pulse rounded-full" aria-hidden="true" /> Recording - stops by itself at {clock(MAX_RECORDING_SECONDS)}
              </span>
              {" - "}
              {isPart2 ? "speak for 1 to 2 minutes" : `aim for ${guide.suggested}`}
            </p>
            <div className="bg-secondary mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full" aria-hidden="true">
              <div className={cn("h-full rounded-full transition-[width] duration-200", elapsed > MAX_RECORDING_SECONDS - 10 ? "bg-destructive" : "bg-accent")} style={{ width: `${Math.min(100, (elapsed / MAX_RECORDING_SECONDS) * 100)}%` }} />
            </div>
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={cancelBeforeEnd} data-testid="record-cancel">
              <X className="size-4" /> Cancel
            </Button>
            <Button variant="destructive" size="lg" onClick={finish} data-testid="record-stop">
              <Square className="size-4" fill="currentColor" /> Stop
            </Button>
          </div>
        </div>
      )}

      {phase === "review" && recording && url && (
        <div className="border-border bg-card space-y-4 rounded-2xl border p-5" data-testid="review-stage">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-medium">Listen to your answer</h2>
            <p className="text-muted-foreground text-xs" data-testid="review-info">
              {clock(recording.seconds)} - {sizeText(recording.bytes)}
            </p>
          </div>
          <audio controls src={url} className="w-full" data-testid="review-audio" />
          {silent && (
            <p role="alert" className="text-destructive flex items-start gap-2 text-sm" data-testid="record-warning" data-kind="silent">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {SILENT_RECORDING_MESSAGE}
            </p>
          )}
          {tooShort && !silent && (
            <p role="alert" className="text-destructive flex items-start gap-2 text-sm" data-testid="record-warning" data-kind="short">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> This recording is under {MIN_RECORDING_SECONDS} seconds - too short to assess. Record it again.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={discard} data-testid="record-again">
              <RotateCcw className="size-4" /> Record again
            </Button>
            <Button size="lg" disabled={!canSend} onClick={() => recording && onSend({ recording, notes })} data-testid="record-send">
              <Send className="size-4" /> Send for AI assessment
            </Button>
          </div>
        </div>
      )}

      {(phase === "ready" || phase === "opening") && (
        <div>
          <Button variant="ghost" onClick={onBack} data-testid="record-back">
            <ArrowLeft className="size-4" /> Back
          </Button>
        </div>
      )}
    </div>
  );
}

/** The question (and, for Part 2, the cue card) as it stays in front of the student during preparation, recording and review. */
export function PromptCard({ prompt }: { prompt: PracticePrompt }) {
  return (
    <div className="border-border bg-card space-y-2 rounded-2xl border p-5" data-testid="prompt-card">
      <p className="text-accent text-xs font-medium tracking-wide uppercase">{PART_GUIDE[prompt.part].label}</p>
      <p className="font-display text-lg leading-snug font-medium">{prompt.question}</p>
      {prompt.cueCardPoints.length > 0 && (
        <div className="text-sm">
          <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">You should say</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {prompt.cueCardPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
