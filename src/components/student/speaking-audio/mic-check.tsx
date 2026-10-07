"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Mic, MicOff, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LevelMeter } from "@/components/student/speaking-audio/level-meter";
import { describeMicError, SILENT_PEAK_THRESHOLD, SILENT_RECORDING_MESSAGE, type MicProblem } from "@/lib/speaking-audio/mic-errors";
import { encodeCapture, microphoneSupport, openMicrophone, startPcmRecorder, type MicSession } from "@/lib/speaking-audio/recorder";

/**
 * Phase Q-B, step 2 - check the microphone before anything is recorded: ask for permission (with clear steps when the browser has it blocked - Safari and iOS included),
 * show a live level meter, and let the student record three seconds and play them back. The microphone is released when the student leaves this step.
 */

const TEST_SECONDS = 3;
/** The meter has to have gone above this (a spoken word, not room noise) for "we can hear you". */
const HEARD_LEVEL = 0.08;

type Status = "idle" | "opening" | "listening" | "testing" | "tested";

export function MicCheck({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [problem, setProblem] = useState<MicProblem | null>(null);
  const [heard, setHeard] = useState(false);
  const [testUrl, setTestUrl] = useState<string | null>(null);
  const [testSilent, setTestSilent] = useState(false);
  const sessionRef = useRef<MicSession | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getLevel = useCallback(() => sessionRef.current?.level() ?? 0, []);

  const release = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  // A page that cannot use a microphone at all (http, an old browser) says so at once; a browser that has already blocked it says how to unblock it.
  useEffect(() => {
    const unavailable = microphoneSupport();
    if (unavailable) {
      setProblem(describeMicError({ name: unavailable === "insecure" ? "InsecureContextError" : "UnsupportedError" }, navigator.userAgent));
      return;
    }
    let cancelled = false;
    try {
      void navigator.permissions
        ?.query({ name: "microphone" as PermissionName })
        .then((state) => {
          if (!cancelled && state.state === "denied") setProblem(describeMicError({ name: "NotAllowedError" }, navigator.userAgent));
        })
        .catch(() => {});
    } catch {
      // some browsers (Safari) cannot be asked
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      release();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [release]
  );

  // While listening: has anything been heard yet?
  useEffect(() => {
    if (status !== "listening" && status !== "testing") return;
    const interval = setInterval(() => {
      if ((sessionRef.current?.peakSinceOpen() ?? 0) > HEARD_LEVEL) setHeard(true);
    }, 200);
    return () => clearInterval(interval);
  }, [status]);

  async function turnOn() {
    setProblem(null);
    setStatus("opening");
    release();
    try {
      sessionRef.current = await openMicrophone({
        onEnded: () => {
          setProblem({ code: "busy", message: "The microphone was disconnected.", steps: ["Plug it in again or choose another microphone, then press Try again."] });
          setStatus("idle");
          release();
        },
      });
      setStatus("listening");
    } catch (error) {
      setProblem(describeMicError(error, navigator.userAgent));
      setStatus("idle");
    }
  }

  function recordTest() {
    const session = sessionRef.current;
    if (!session) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setTestUrl(null);
    setTestSilent(false);
    const recorder = startPcmRecorder(session, { maxSeconds: TEST_SECONDS });
    setStatus("testing");
    timerRef.current = setTimeout(() => {
      const encoded = encodeCapture(recorder.stop());
      const silent = encoded.peak < SILENT_PEAK_THRESHOLD;
      setTestSilent(silent);
      if (!silent) setHeard(true);
      const url = URL.createObjectURL(encoded.blob);
      urlRef.current = url;
      setTestUrl(url);
      setStatus("tested");
    }, TEST_SECONDS * 1000 + 150);
  }

  function leave(next: () => void) {
    release();
    next();
  }

  const open = status === "listening" || status === "testing" || status === "tested";

  return (
    <div className="space-y-5" data-testid="mic-check">
      <div className="space-y-1.5">
        <h2 className="font-display text-lg font-medium">Check your microphone</h2>
        <p className="text-muted-foreground text-sm">Turn it on, say a few words and watch the bars move. Then record three seconds and listen back - if you can hear yourself clearly, you are ready.</p>
      </div>

      {problem && (
        <div role="alert" className="border-destructive/30 bg-destructive/5 space-y-2 rounded-2xl border p-4 text-sm" data-testid="mic-problem" data-code={problem.code}>
          <p className="text-destructive flex items-center gap-2 font-medium">
            <MicOff className="size-4 shrink-0" /> {problem.message}
          </p>
          <ol className="text-muted-foreground list-decimal space-y-1 pl-5">
            {problem.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {problem.code !== "insecure" && problem.code !== "unsupported" && (
            <Button type="button" size="sm" variant="outline" onClick={turnOn} data-testid="mic-retry">
              <RotateCcw className="size-4" /> Try again
            </Button>
          )}
        </div>
      )}

      <div className="border-border bg-card space-y-4 rounded-2xl border p-5">
        <LevelMeter getLevel={open ? getLevel : null} active={open} />
        <p className="text-center text-sm" aria-live="polite" data-testid="mic-status">
          {status === "idle" && !problem && "The microphone is off."}
          {status === "opening" && "Waiting for you to allow the microphone..."}
          {status === "listening" && (heard ? "We can hear you." : "Say a few words...")}
          {status === "testing" && `Recording ${TEST_SECONDS} seconds - keep talking.`}
          {status === "tested" && (testSilent ? SILENT_RECORDING_MESSAGE : "Press play and listen: is your voice clear?")}
        </p>

        <div className="flex flex-wrap justify-center gap-2">
          {!open && (
            <Button type="button" onClick={turnOn} disabled={status === "opening" || problem?.code === "insecure" || problem?.code === "unsupported"} data-testid="mic-on">
              <Mic className="size-4" /> Turn on microphone
            </Button>
          )}
          {open && (
            <Button type="button" variant="secondary" onClick={recordTest} disabled={status === "testing"} data-testid="mic-test">
              <Mic className="size-4" /> {status === "tested" ? "Record the test again" : `Record ${TEST_SECONDS} seconds and play back`}
            </Button>
          )}
        </div>

        {testUrl && (
          <div className="space-y-2">
            <audio controls src={testUrl} className="w-full" data-testid="mic-test-audio" />
            {testSilent && (
              <p className="text-destructive flex items-center gap-1.5 text-xs">
                <AlertTriangle className="size-3.5 shrink-0" /> No sound was recorded.
              </p>
            )}
            {!testSilent && (
              <p className="text-success flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="size-3.5 shrink-0" /> Sound was recorded.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={() => leave(onBack)} data-testid="mic-back">
          <ArrowLeft className="size-4" /> Change the question
        </Button>
        <div className="flex items-center gap-3">
          {!heard && (
            <button type="button" className="text-muted-foreground text-xs underline underline-offset-2" onClick={() => leave(onDone)} data-testid="mic-skip">
              Skip the check
            </button>
          )}
          <Button size="lg" disabled={!heard} onClick={() => leave(onDone)} data-testid="mic-continue">
            Continue <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
