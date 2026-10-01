"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { IMAGE_INPUT_ACCEPT, validateImageFile } from "@/lib/uploads/image-constraints";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FallbackImage } from "@/components/ui/fallback-image";

/**
 * Phase 47 — Skill Media Library's "Content thumbnail" uploader, shared by
 * every content type that got a real `coverImagePath` field this phase
 * (Reading/Listening MockTest, WritingTask, SpeakingTask edit pages share
 * this exact upload/replace/remove interaction rather than three near-copies).
 */
export function ContentCoverImageUploader({
  initialPath,
  action,
  label = "Cover image (optional)",
  alt = "Cover image",
}: {
  initialPath: string | null;
  action: (formData: FormData | null) => Promise<{ success: boolean; error?: string }>;
  label?: string;
  alt?: string;
}) {
  const [coverImagePath, setCoverImagePath] = useState(initialPath);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setPending(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await action(formData);
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not upload the cover image.");
      return;
    }
    setCoverImagePath(URL.createObjectURL(file));
    toast.success("Cover image updated.");
  }

  async function handleRemove() {
    setPending(true);
    const result = await action(null);
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Could not remove the cover image.");
      return;
    }
    setCoverImagePath(null);
    toast.success("Cover image removed.");
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input ref={fileInputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleFileChange} />
      {coverImagePath ? (
        <div className="border-border/70 bg-secondary/20 relative w-full max-w-xs overflow-hidden rounded-xl border">
          <div className="bg-secondary relative aspect-video">
            <FallbackImage src={coverImagePath} alt={alt} fill sizes="320px" className="object-cover" unoptimized />
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            aria-label="Remove cover image"
            className="bg-background/90 text-muted-foreground hover:text-destructive absolute top-1.5 right-1.5 rounded-full p-1.5 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => fileInputRef.current?.click()}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          Upload cover image
        </Button>
      )}
    </div>
  );
}
