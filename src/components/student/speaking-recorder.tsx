"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw, Send, Square } from "lucide-react";
import { toast } from "sonner";

import { prepareSpeakingAudioUploadAction, submitSpeakingResponseAction } from "@/actions/speaking.actions";
import { uploadToSignedUrl } from "@/lib/uploads/supabase-browser";
import { SPEAKING_AUDIO_BUCKET } from "@/lib/uploads/bucket-names";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "recording" | "recorded" | "submitting" | "submitted";

export function SpeakingRecorder({ taskId, onSubmitted }: { taskId: string; onSubmitted: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setPhase("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Microphone access is required to record a speaking response.");
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

    setPhase("submitting");
    try {
      const contentType = blob.type || "audio/webm";
      const prepared = await prepareSpeakingAudioUploadAction({ fileSize: blob.size, contentType });
      if (!prepared.success) {
        toast.error(prepared.error);
        setPhase("recorded");
        return;
      }

      const file = new File([blob], "speaking-response", { type: contentType });
      await uploadToSignedUrl(SPEAKING_AUDIO_BUCKET, prepared.path, prepared.token, file, contentType);

      const result = await submitSpeakingResponseAction(taskId, prepared.publicUrl);
      if (!result.success) {
        toast.error(result.error);
        setPhase("recorded");
        return;
      }

      setPhase("submitted");
      toast.success("Speaking response submitted.");
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your recording.");
      setPhase("recorded");
    }
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (phase === "submitted") {
    return <p className="text-success text-sm font-medium">Submitted — your teacher will review it soon.</p>;
  }

  return (
    <div className="space-y-3">
      {phase === "idle" && (
        <Button onClick={startRecording}>
          <Mic className="size-4" /> Start Recording
        </Button>
      )}

      {phase === "recording" && (
        <div className="flex items-center gap-3">
          <Button variant="destructive" onClick={stopRecording}>
            <Square className="size-4" /> Stop
          </Button>
          <span className="text-muted-foreground font-mono text-sm tabular-nums">
            {minutes}:{secs.toString().padStart(2, "0")}
          </span>
        </div>
      )}

      {(phase === "recorded" || phase === "submitting") && previewUrl && (
        <div className="space-y-3">
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={phase === "submitting"}>
              {phase === "submitting" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Submit
            </Button>
            <Button variant="outline" onClick={resetRecording} disabled={phase === "submitting"}>
              <RotateCcw className="size-4" /> Re-record
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
