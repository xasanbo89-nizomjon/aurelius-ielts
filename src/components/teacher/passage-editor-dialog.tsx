"use client";

import { useEffect, useRef, useState } from "react";
import { FileAudio, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { addPassageAction, updatePassageAction, uploadPassageAudioAction } from "@/actions/test-management.actions";
import { AUDIO_INPUT_ACCEPT, resolvePassageAudioSrc, validateAudioFile } from "@/lib/uploads/audio-constraints";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ExistingPassage = {
  id: string;
  title: string;
  content: string;
  audioUrl: string | null;
  audioPath: string | null;
  audioFileName: string | null;
};

type NewUpload = { path: string; fileName: string; mimeType: string; size: number };

export function PassageEditorDialog({
  open,
  onOpenChange,
  testId,
  testType,
  existingPassage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: string;
  testType: "READING" | "LISTENING";
  existingPassage?: ExistingPassage;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  // Only set when a fresh upload happens *this session* — an existing
  // passage's audio is read from `existingPassage` directly and left
  // untouched on save unless this is populated. See handleSubmit.
  const [newUpload, setNewUpload] = useState<NewUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(existingPassage?.title ?? "");
    setContent(existingPassage?.content ?? "");
    setNewUpload(null);
  }, [open, existingPassage]);

  const previewSrc = newUpload?.path ?? (existingPassage ? resolvePassageAudioSrc(existingPassage) : null);
  const previewFileName = newUpload?.fileName ?? existingPassage?.audioFileName ?? null;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again still fires a change event.
    event.target.value = "";
    if (!file) return;

    const validation = validateAudioFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadPassageAudioAction(formData);
    setUploading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setNewUpload({ path: result.path, fileName: result.fileName, mimeType: result.mimeType, size: result.size });
    toast.success("Audio uploaded.");
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Give this passage a title.");
      return;
    }
    if (testType === "READING" && !content.trim()) {
      toast.error("Add the passage text.");
      return;
    }
    if (testType === "LISTENING" && !previewSrc) {
      toast.error("Upload an audio file.");
      return;
    }

    setSubmitting(true);
    const input = {
      title,
      content,
      // Only included when a new file was uploaded this session — omitting
      // these otherwise leaves an existing passage's audio untouched
      // (see updatePassageAction).
      ...(newUpload && {
        audioPath: newUpload.path,
        audioFileName: newUpload.fileName,
        audioMimeType: newUpload.mimeType,
        audioSize: newUpload.size,
      }),
    };
    const result = existingPassage
      ? await updatePassageAction(existingPassage.id, testId, input)
      : await addPassageAction(testId, input);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(existingPassage ? "Passage updated." : "Passage added.");
    onOpenChange(false);
  }

  const busy = submitting || uploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingPassage ? "Edit passage" : "Add passage"}</DialogTitle>
          <DialogDescription>
            {testType === "LISTENING"
              ? "One section of the listening test, with its own audio."
              : "One reading passage with its own text."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="passage-title">Title</Label>
            <Input
              id="passage-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={testType === "LISTENING" ? "Section 1" : "Passage 1"}
            />
          </div>

          {testType === "LISTENING" && (
            <div className="space-y-1.5">
              <Label>Audio</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={AUDIO_INPUT_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {previewSrc ? "Replace audio" : "Upload audio"}
              </Button>

              {previewSrc && (
                <div className="border-border/70 bg-secondary/30 space-y-2 rounded-xl border p-3">
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <FileAudio className="size-3.5 shrink-0" aria-hidden="true" />
                    {previewFileName ?? "Current audio"}
                  </p>
                  <audio controls src={previewSrc} className="w-full">
                    Your browser doesn&apos;t support audio playback.
                  </audio>
                </div>
              )}

              <p className="text-muted-foreground text-xs">Accepts .mp3, .wav and .m4a files, up to 50MB.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="passage-content">{testType === "LISTENING" ? "Transcript (optional)" : "Passage text"}</Label>
            <Textarea
              id="passage-content"
              rows={10}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="font-display"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {existingPassage ? "Save changes" : "Add passage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
