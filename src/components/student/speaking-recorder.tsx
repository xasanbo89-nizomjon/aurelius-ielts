"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw, Send, Square, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { submitSpeakingRecordingAction } from "@/actions/speaking.actions";
import { MAX_RECORDED_AUDIO_SIZE_BYTES, MAX_RECORDED_AUDIO_SIZE_LABEL } from "@/lib/uploads/audio-constraints";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Phase = "idle" | "recording" | "recorded" | "evaluating" | "submitted";

const WAVEFORM_BARS = 24;

/** Human-readable text for the getUserMedia rejection reasons that actually occur on real devices. */
function micErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access was denied. Enable it for this site in your browser settings, then try again.";
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "No microphone was found on this device.";
    }
    if (error.name === "NotReadableError") {
      return "Your microphone is already in use by another app.";
    }
  }
  return "Could not access your microphone. Please try again.";
}

export function SpeakingRecorder({ taskId, onSubmitted }: { taskId: string; onSubmitted: (submissionId: string) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(WAVEFORM_BARS).fill(0.08));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      stopWaveform();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startWaveform(stream: MediaStream) {
    try {
      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextCtor();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const step = Math.max(1, Math.floor(data.length / WAVEFORM_BARS));

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const next: number[] = [];
        for (let i = 0; i < WAVEFORM_BARS; i++) {
          next.push(Math.max(0.08, (data[i * step] ?? 0) / 255));
        }
        setLevels(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Real-time waveform is a visual nice-to-have — never block recording if unsupported.
    }
  }

  function stopWaveform() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevels(Array(WAVEFORM_BARS).fill(0.08));
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase("recorded");
        stream.getTracks().forEach((track) => track.stop());
        stopWaveform();
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      startWaveform(stream);
      setPhase("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (error) {
      toast.error(micErrorMessage(error));
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function resetRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    blobRef.current = null;
    setPreviewUrl(null);
    setPhase("idle");
    setSeconds(0);
  }

  async function handleSubmit() {
    const blob = blobRef.current;
    if (!blob) return;

    if (blob.size > MAX_RECORDED_AUDIO_SIZE_BYTES) {
      toast.error(`Your recording is too long — please keep it under ${MAX_RECORDED_AUDIO_SIZE_LABEL}.`);
      return;
    }

    setPhase("evaluating");
    try {
      const contentType = blob.type || "audio/webm";
      const file = new File([blob], "speaking-response", { type: contentType });

      const result = await submitSpeakingRecordingAction(taskId, file);
      if (!result.success) {
        toast.error(result.error);
        setPhase("recorded");
        return;
      }

      setPhase("submitted");
      toast.success("Your Speaking result is ready.");
      onSubmitted(result.submissionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not evaluate your recording.");
      setPhase("recorded");
    }
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (phase === "submitted") {
    return <p className="text-success text-sm font-medium">Evaluated — see your result below.</p>;
  }

  return (
    <div className="space-y-4">
      {phase === "idle" && (
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={startRecording}
            aria-label="Start recording"
            className="bg-accent text-accent-foreground shadow-soft-lg flex size-20 items-center justify-center rounded-full transition-transform active:scale-95"
          >
            <Mic className="size-8" strokeWidth={1.75} />
          </button>
          <p className="text-muted-foreground text-xs">Tap to start recording</p>
        </div>
      )}

      {phase === "recording" && (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex h-16 items-end justify-center gap-[3px]">
            {levels.map((level, index) => (
              <span
                key={index}
                className="bg-accent w-1.5 rounded-full transition-[height] duration-75"
                style={{ height: `${Math.round(level * 100)}%` }}
              />
            ))}
          </div>
          <span className="text-foreground font-mono text-lg tabular-nums">
            {minutes}:{secs.toString().padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Stop recording"
            className="bg-destructive text-destructive-foreground shadow-soft-lg flex size-20 items-center justify-center rounded-full transition-transform active:scale-95"
          >
            <Square className="size-7" strokeWidth={1.75} fill="currentColor" />
          </button>
        </div>
      )}

      {(phase === "recorded" || phase === "evaluating") && previewUrl && (
        <div className="space-y-3">
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" onClick={handleSubmit} disabled={phase === "evaluating"} className={cn("flex-1")}>
              {phase === "evaluating" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Submit for AI Evaluation
            </Button>
            <Button size="lg" variant="outline" onClick={resetRecording} disabled={phase === "evaluating"}>
              <RotateCcw className="size-4" /> Re-record
            </Button>
          </div>
          {phase === "evaluating" && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Sparkles className="size-3.5" /> AI is scoring your response — this can take up to 30 seconds. Your recording is never stored.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
