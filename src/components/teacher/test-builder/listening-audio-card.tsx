"use client";

import { useRef, useState } from "react";
import { FileAudio, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { attachBuilderAudioAction, prepareBuilderAudioUploadAction, removeBuilderAudioAction } from "@/actions/test-builder.actions";
import type { BuilderPartInfo } from "@/lib/exam/test-builder";
import { AUDIO_INPUT_ACCEPT, MAX_AUDIO_FILE_SIZE_LABEL, validateAudioFile } from "@/lib/uploads/audio-constraints";
import { LISTENING_AUDIO_BUCKET } from "@/lib/uploads/bucket-names";
import { uploadToSignedUrl } from "@/lib/uploads/supabase-browser";
import { formatTimeInput, parseTimeInput } from "@/lib/exam/test-validation";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/components/teacher/test-builder/controls";

/**
 * The recording of a Listening test and where each part starts in it. One recording for the whole test is the normal case: the teacher uploads it once
 * (straight from the browser to storage, so a big file never goes through a server action), the server measures its length, and the start of Parts 2-4
 * is entered as mm:ss - with a small player to find the spot ("Set to current position"). When every part has its own recording the start times do not
 * apply, and the student's screen already follows the recordings from part to part by itself.
 */
export function ListeningAudioCard({
  testId,
  parts,
  startSeconds,
  disabled,
  onStartChange,
  onAudioChanged,
}: {
  testId: string;
  parts: BuilderPartInfo[];
  /** The start time of each part as the editor holds it (index 0 is always Part 1: it starts at 0). */
  startSeconds: (number | null)[];
  disabled: boolean;
  onStartChange: (partIndex: number, seconds: number | null) => void;
  onAudioChanged: (parts: BuilderPartInfo[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const playerRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [timeText, setTimeText] = useState<Record<number, string>>({});

  const sources = [...new Set(parts.map((part) => part.audioSrc).filter((src): src is string => !!src))];
  const shared = sources.length === 1 && parts.length > 1 && parts.every((part) => part.audioSrc === sources[0]);
  const first = parts.find((part) => part.audioSrc);
  const duration = first?.audioDurationSeconds ?? null;

  async function upload(file: File) {
    const validation = validateAudioFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    setBusy("Uploading the recording…");
    setProgress(0);
    try {
      const contentType = file.type || validation.contentType;
      const prepared = await prepareBuilderAudioUploadAction({ fileName: file.name, fileSize: file.size, contentType });
      if (!prepared.success) throw new Error(prepared.error);
      await uploadToSignedUrl(LISTENING_AUDIO_BUCKET, prepared.path, prepared.token, file, contentType);
      setProgress(null);
      setBusy("Measuring its length…");
      const result = await attachBuilderAudioAction(testId, { url: prepared.publicUrl, fileName: file.name, mimeType: contentType, size: file.size });
      if (!result.success) throw new Error(result.error);
      onAudioChanged(result.parts);
      const measured = result.parts[0]?.audioDurationSeconds;
      toast.success(measured ? `Recording attached (${formatTimeInput(measured)} long).` : "Recording attached, but its length could not be read - upload an MP3, WAV or M4A file.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the recording.");
    } finally {
      setBusy(null);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    setBusy("Removing…");
    const result = await removeBuilderAudioAction(testId);
    setBusy(null);
    if (!result.success) toast.error(result.error);
    else onAudioChanged(result.parts);
  }

  function commitTime(index: number, text: string) {
    const seconds = parseTimeInput(text);
    if (seconds !== null && Number.isNaN(seconds)) {
      toast.error("Enter the time as minutes:seconds, for example 7:05.");
      return;
    }
    onStartChange(index, seconds);
    setTimeText((prev) => ({ ...prev, [index]: seconds === null ? "" : formatTimeInput(seconds) }));
  }

  return (
    <section id="focus-audio" className="border-border/70 bg-card scroll-mt-24 space-y-3 rounded-2xl border p-4" data-testid="audio-card">
      <header className="flex flex-wrap items-center gap-2">
        <FileAudio className="text-accent size-5" aria-hidden="true" />
        <h2 className="font-display text-lg font-medium">Recording</h2>
        {duration != null && (
          <span className="text-muted-foreground text-sm" data-testid="audio-duration">
            {formatTimeInput(duration)} long
          </span>
        )}
      </header>

      {sources.length === 0 ? (
        <p className="text-muted-foreground text-sm">No recording yet. Upload the one recording of the whole test (MP3, WAV or M4A, up to {MAX_AUDIO_FILE_SIZE_LABEL}). It goes straight to storage, so a large file is fine.</p>
      ) : (
        <>
          <p className="text-sm" data-testid="audio-file">
            {first?.audioFileName ?? "Recording"} {shared ? `- one recording for all ${parts.length} parts` : `- ${sources.length} different recordings`}
          </p>
          <audio ref={playerRef} controls preload="metadata" src={first?.audioSrc ?? undefined} className="w-full" data-testid="audio-player" />
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept={AUDIO_INPUT_ACCEPT} className="hidden" data-testid="audio-file-input" disabled={disabled || busy !== null} onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} />
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy !== null} onClick={() => fileRef.current?.click()} data-testid="upload-recording">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {sources.length ? "Replace the recording" : "Upload the recording"}
        </Button>
        {sources.length > 0 && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled || busy !== null} onClick={() => void remove()} data-testid="remove-recording">
            <Trash2 className="size-4" /> Remove
          </Button>
        )}
        {busy && <span className="text-muted-foreground text-xs" data-testid="audio-busy">{busy}{progress != null ? ` ${progress}%` : ""}</span>}
      </div>

      {sources.length > 1 && !shared && <p className="text-muted-foreground text-sm">The parts have recordings of their own, so the student&apos;s screen follows them from part to part by itself. Start times are only needed for one shared recording.</p>}

      {shared && (
        <div id="focus-times" className="scroll-mt-24 space-y-2" data-testid="start-times">
          <p className="text-sm font-medium">Where each part starts in the recording</p>
          <p className="text-muted-foreground text-xs">
            Play the recording, stop where Part 2 begins and press &quot;Set to current position&quot;. When Parts 2 to {parts.length} all have a start time, the student&apos;s screen moves to the next part by itself at that moment. Leave them all empty to keep the old behaviour (the student turns the parts).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {parts.slice(1).map((_, offset) => {
              const index = offset + 1;
              const value = timeText[index] ?? formatTimeInput(startSeconds[index]);
              return (
                <div key={index} className="space-y-1">
                  <label className="text-sm" htmlFor={`start-${index}`}>
                    Part {index + 1} starts at
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      id={`start-${index}`}
                      className={FIELD}
                      placeholder="m:ss"
                      value={value}
                      disabled={disabled}
                      onChange={(event) => setTimeText((prev) => ({ ...prev, [index]: event.target.value }))}
                      onBlur={(event) => commitTime(index, event.target.value)}
                      data-testid={`start-time-${index + 1}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      const at = Math.floor(playerRef.current?.currentTime ?? 0);
                      onStartChange(index, at);
                      setTimeText((prev) => ({ ...prev, [index]: formatTimeInput(at) }));
                    }}
                    data-testid={`use-position-${index + 1}`}
                  >
                    Set to current position
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
