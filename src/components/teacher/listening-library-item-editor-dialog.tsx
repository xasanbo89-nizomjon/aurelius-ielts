"use client";

import { useEffect, useRef, useState } from "react";
import { FileAudio, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { ArticleDifficulty, ListeningAccent } from "@prisma/client";

import {
  createListeningLibraryItemAction,
  updateListeningLibraryItemAction,
  prepareListeningLibraryAudioUploadAction,
  uploadListeningLibraryCoverAction,
} from "@/actions/listening-library.actions";
import { validateAudioFile, AUDIO_INPUT_ACCEPT } from "@/lib/uploads/audio-constraints";
import { validateImageFile, IMAGE_INPUT_ACCEPT } from "@/lib/uploads/image-constraints";
import { uploadToSignedUrl } from "@/lib/uploads/supabase-browser";
import { LISTENING_LIBRARY_AUDIO_BUCKET } from "@/lib/uploads/bucket-names";
import { getAudioDuration } from "@/lib/audio-duration";
import { ARTICLE_DIFFICULTY_LABELS, LISTENING_ACCENT_LABELS } from "@/lib/labels";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FallbackImage } from "@/components/ui/fallback-image";

const LEVEL_OPTIONS: ArticleDifficulty[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "IELTS_ACADEMIC"];
const ACCENT_OPTIONS: ListeningAccent[] = ["BRITISH", "AMERICAN", "AUSTRALIAN", "CANADIAN"];

export type ExistingListeningLibraryItem = {
  id: string;
  title: string;
  description: string | null;
  level: ArticleDifficulty;
  accent: ListeningAccent;
  transcript: string | null;
  audioPath: string;
  audioFileName: string;
  coverImagePath: string | null;
};

export function ListeningLibraryItemEditorDialog({
  open,
  onOpenChange,
  existingItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingItem?: ExistingListeningLibraryItem;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<ArticleDifficulty>("IELTS_ACADEMIC");
  const [accent, setAccent] = useState<ListeningAccent>("BRITISH");
  const [transcript, setTranscript] = useState("");

  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioSize, setAudioSize] = useState<number>(0);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<number | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(existingItem?.title ?? "");
    setDescription(existingItem?.description ?? "");
    setLevel(existingItem?.level ?? "IELTS_ACADEMIC");
    setAccent(existingItem?.accent ?? "BRITISH");
    setTranscript(existingItem?.transcript ?? "");
    setAudioPath(existingItem?.audioPath ?? null);
    setAudioFileName(existingItem?.audioFileName ?? null);
    setAudioSize(0);
    setAudioDurationSeconds(null);
    setCoverPath(existingItem?.coverImagePath ?? null);
  }, [open, existingItem]);

  async function handleAudioChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateAudioFile({ name: file.name, size: file.size, type: file.type });
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploadingAudio(true);
    try {
      const duration = await getAudioDuration(file);
      const prepared = await prepareListeningLibraryAudioUploadAction({ fileName: file.name, fileSize: file.size, contentType: validation.contentType });
      if (!prepared.success) {
        toast.error(prepared.error);
        return;
      }
      await uploadToSignedUrl(LISTENING_LIBRARY_AUDIO_BUCKET, prepared.path, prepared.token, file, validation.contentType);
      setAudioPath(prepared.publicUrl);
      setAudioFileName(file.name);
      setAudioSize(file.size);
      setAudioDurationSeconds(duration ? Math.round(duration) : null);
      toast.success("Audio uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the audio.");
    } finally {
      setUploadingAudio(false);
    }
  }

  async function handleCoverChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploadingCover(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadListeningLibraryCoverAction(formData);
    setUploadingCover(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCoverPath(result.path);
    toast.success("Cover image uploaded.");
  }

  async function handleSubmit() {
    if (!audioPath || !audioFileName) {
      toast.error("Upload an audio file first.");
      return;
    }

    setSubmitting(true);
    const input = {
      title,
      description: description.trim() || undefined,
      level,
      accent,
      transcript: transcript.trim() || undefined,
      audioPath,
      audioFileName,
      audioSize: audioSize || 1,
      audioDurationSeconds: audioDurationSeconds ?? undefined,
      coverImagePath: coverPath || undefined,
    };
    const result = existingItem
      ? await updateListeningLibraryItemAction(existingItem.id, input)
      : await createListeningLibraryItemAction(input);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(existingItem ? "Listening updated." : "Listening created as a draft.");
    onOpenChange(false);
  }

  const canSave = Boolean(title.trim() && audioPath);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingItem ? "Edit listening" : "New listening"}</DialogTitle>
          <DialogDescription>Publish it separately when you&apos;re ready for students to see it.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="listening-title">Title</Label>
            <Input id="listening-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Section 1 — Booking a Hotel Room" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="listening-description">Description</Label>
            <Textarea id="listening-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="listening-level">IELTS Level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as ArticleDifficulty)}>
                <SelectTrigger id="listening-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ARTICLE_DIFFICULTY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="listening-accent">Accent</Label>
              <Select value={accent} onValueChange={(v) => setAccent(v as ListeningAccent)}>
                <SelectTrigger id="listening-accent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCENT_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {LISTENING_ACCENT_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Audio (MP3)</Label>
            <input ref={audioInputRef} type="file" accept={AUDIO_INPUT_ACCEPT} className="hidden" onChange={handleAudioChange} />
            {audioFileName ? (
              <div className="border-border/70 bg-secondary/20 flex items-center justify-between gap-2 rounded-xl border p-3">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <FileAudio className="text-accent size-4 shrink-0" />
                  <span className="truncate">{audioFileName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAudioPath(null);
                    setAudioFileName(null);
                    setAudioSize(0);
                    setAudioDurationSeconds(null);
                  }}
                  aria-label="Remove audio"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={uploadingAudio} onClick={() => audioInputRef.current?.click()}>
                {uploadingAudio ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Upload audio
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="listening-transcript">Transcript (optional)</Label>
            <Textarea id="listening-transcript" rows={5} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste the real transcript here…" />
          </div>

          <div className="space-y-1.5">
            <Label>Cover image (optional)</Label>
            <input ref={coverInputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleCoverChange} />
            {coverPath ? (
              <div className="border-border/70 bg-secondary/20 relative w-full max-w-xs overflow-hidden rounded-xl border">
                <div className="bg-secondary relative aspect-video">
                  <FallbackImage src={coverPath} alt="Cover" fill sizes="320px" className="object-cover" unoptimized />
                </div>
                <button
                  type="button"
                  onClick={() => setCoverPath(null)}
                  aria-label="Remove cover"
                  className="bg-background/90 text-muted-foreground hover:text-destructive absolute top-1.5 right-1.5 rounded-full p-1.5"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={uploadingCover} onClick={() => coverInputRef.current?.click()}>
                {uploadingCover ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Upload cover
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !canSave}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
