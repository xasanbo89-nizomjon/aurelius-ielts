"use client";

import { useRef, useState } from "react";
import { AlertCircle, FileAudio, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { attachBuilderAudioAction, prepareBuilderAudioUploadAction, removeBuilderAudioAction } from "@/actions/test-builder.actions";
import type { BuilderPartInfo } from "@/lib/exam/test-builder";
import { AUDIO_INPUT_ACCEPT, MAX_AUDIO_FILE_SIZE_LABEL, validateAudioFile } from "@/lib/uploads/audio-constraints";
import { LISTENING_AUDIO_BUCKET } from "@/lib/uploads/bucket-names";
import { UploadError, uploadToSignedUrl, type UploadProgress } from "@/lib/uploads/supabase-browser";
import { formatBytes, formatSpeed } from "@/lib/uploads/upload-policy";
import { formatTimeInput, parseTimeInput } from "@/lib/exam/test-validation";
import { Button } from "@/components/ui/button";
import { FIELD } from "@/components/teacher/test-builder/controls";

/** The line above the progress bar: what is happening now, in words. */
function progressText(progress: UploadProgress | null, fallback: string): string {
  if (!progress) return fallback;
  if (progress.state === "waiting-to-retry") return `${progress.lastError ?? "The upload was interrupted."} Trying again (attempt ${progress.attempt} of ${progress.attempts})…`;
  if (progress.state === "finishing") return "Saving the recording…";
  const speed = formatSpeed(progress.speedBytesPerSecond);
  const attempt = progress.attempt > 1 ? `Attempt ${progress.attempt} of ${progress.attempts} · ` : "";
  return `${attempt}Uploading the recording… ${progress.percent}% (${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}${speed ? ` · ${speed}` : ""})`;
}

/**
 * The recording of a Listening test and where each part starts in it. One recording for the whole test is the normal case: the teacher uploads it once
 * (straight from the browser to storage, so a big file never goes through a server action), the server measures its length, and the start of Parts 2-4
 * is entered as mm:ss - with a small player to find the spot ("Set to current position"). When every part has its own recording the start times do not
 * apply, and the student's screen already follows the recordings from part to part by itself.
 *
 * Phase Q: the upload shows a real progress bar (percent, megabytes, speed), can be cancelled, is tried again by itself when the connection drops or stalls,
 * and when it finally fails says why in one sentence and offers "Try again" with the same file.
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
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [failure, setFailure] = useState<{ message: string; file: File } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Which upload is the current one: a cancelled upload that is still winding down must not touch the screen of the next. */
  const runRef = useRef(0);
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
      setFailure({ message: validation.error, file });
      toast.error(validation.error);
      return;
    }
    setFailure(null);
    setBusy("Uploading the recording…");
    setProgress(null);
    const run = ++runRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const contentType = file.type || validation.contentType;
      const prepared = await prepareBuilderAudioUploadAction({ fileName: file.name, fileSize: file.size, contentType });
      if (controller.signal.aborted) return; // cancelled while the link was being prepared
      if (!prepared.success) throw new Error(prepared.error);
      await uploadToSignedUrl(LISTENING_AUDIO_BUCKET, prepared.path, prepared.token, file, contentType, {
        onProgress: (next) => {
          if (runRef.current === run) setProgress(next);
        },
        signal: controller.signal,
      });
      setProgress(null);
      setBusy("Measuring its length…");
      const result = await attachBuilderAudioAction(testId, { url: prepared.publicUrl, fileName: file.name, mimeType: contentType, size: file.size });
      if (!result.success) throw new Error(result.error);
      onAudioChanged(result.parts);
      const measured = result.parts[0]?.audioDurationSeconds;
      toast.success(measured ? `Recording attached (${formatTimeInput(measured)} long).` : "Recording attached, but its length could not be read - upload an MP3, WAV or M4A file.");
    } catch (error) {
      if (runRef.current !== run) return; // cancelled: the screen was already reset by cancel()
      const message = error instanceof Error ? error.message : "Could not upload the recording.";
      if (error instanceof UploadError && error.kind === "cancelled") toast.message(message);
      else {
        setFailure({ message, file });
        toast.error(message);
      }
    } finally {
      if (runRef.current === run) {
        abortRef.current = null;
        setBusy(null);
        setProgress(null);
      }
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /** Cancel is felt at once: the bar goes, the buttons are free again; what is still winding down in the background is ignored. */
  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    runRef.current++;
    setBusy(null);
    setProgress(null);
    toast.message("The upload was cancelled.");
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

  const uploading = busy !== null && (progress !== null || busy.startsWith("Uploading"));

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
        <p className="text-muted-foreground text-sm">
          No recording yet. Upload the one recording of the whole test (MP3, WAV or M4A, up to {MAX_AUDIO_FILE_SIZE_LABEL}). It goes straight to storage, so a large file is fine. A 30-minute MP3 is
          about 30 MB; a WAV of the same length is far larger - export it as MP3 first.
        </p>
      ) : (
        <>
          <p className="text-sm" data-testid="audio-file">
            {first?.audioFileName ?? "Recording"} {shared ? `- one recording for all ${parts.length} parts` : `- ${sources.length} different recordings`}
          </p>
          <audio ref={playerRef} controls preload="metadata" src={first?.audioSrc ?? undefined} className="w-full" data-testid="audio-player" />
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={AUDIO_INPUT_ACCEPT}
          className="hidden"
          data-testid="audio-file-input"
          disabled={disabled || busy !== null}
          onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy !== null} onClick={() => fileRef.current?.click()} data-testid="upload-recording">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {sources.length ? "Replace the recording" : "Upload the recording"}
        </Button>
        {sources.length > 0 && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled || busy !== null} onClick={() => void remove()} data-testid="remove-recording">
            <Trash2 className="size-4" /> Remove
          </Button>
        )}
      </div>

      {busy && (
        <div className="space-y-1.5" role="status" aria-live="polite" data-testid="upload-progress">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs" data-testid="audio-busy">
              {progressText(progress, busy)}
            </span>
            {uploading && (
              <Button type="button" variant="ghost" size="sm" onClick={cancel} data-testid="upload-cancel">
                <X className="size-3.5" /> Cancel
              </Button>
            )}
          </div>
          {progress && progress.state !== "waiting-to-retry" && (
            <div className="bg-secondary h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
              <div className="bg-accent h-full rounded-full transition-[width] duration-300" style={{ width: `${progress.percent}%` }} data-testid="upload-bar" data-percent={progress.percent} />
            </div>
          )}
        </div>
      )}

      {failure && !busy && (
        <div className="border-destructive/40 bg-destructive/5 flex flex-wrap items-start gap-3 rounded-xl border px-3 py-2.5 text-sm" role="alert" data-testid="upload-error">
          <AlertCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{failure.message}</p>
          {validateAudioFile(failure.file).valid && (
            <Button type="button" variant="outline" size="sm" onClick={() => void upload(failure.file)} data-testid="upload-retry">
              Try again
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setFailure(null)} aria-label="Dismiss">
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {sources.length > 1 && !shared && (
        <p className="text-muted-foreground text-sm">
          The parts have recordings of their own, so the student&apos;s screen follows them from part to part by itself. Start times are not needed.
        </p>
      )}

      {shared && (
        <div id="focus-times" className="scroll-mt-24 space-y-2" data-testid="start-times">
          <p className="text-sm font-medium">Where each part starts in the recording</p>
          <p className="text-muted-foreground text-xs">
            Play the recording, stop where Part 2 begins and press &quot;Set to current position&quot;. When Parts 2 to {parts.length} all have a start time, the student&apos;s screen moves to the
            next part by itself as the recording reaches it.
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
