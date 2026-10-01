"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Music, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { replaceMediaFileAction, updateMediaFileMetadataAction } from "@/actions/media-library.actions";
import type { MediaFileRow } from "@/lib/media-library";
import { IMAGE_INPUT_ACCEPT, validateImageFile } from "@/lib/uploads/image-constraints";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FallbackImage } from "@/components/ui/fallback-image";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/**
 * Phase 47 — the Media Library's "Preview Image" / "Replace Image" dashboard
 * requirement: a real full-size preview plus editable title/description
 * (stored on MediaFile), and — for images only — replacing the underlying
 * file in place (same MediaFile id, so every existing usage picks up the
 * new image with nothing to re-link).
 */
export function MediaPreviewDialog({
  file,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: {
  file: MediaFileRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (file: MediaFileRow) => void;
  onDeleted: (fileId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file) {
      setTitle(file.title ?? "");
      setDescription(file.description ?? "");
    }
  }, [file]);

  if (!file) return null;

  async function handleSave() {
    if (!file) return;
    setSaving(true);
    const result = await updateMediaFileMetadataAction(file.id, { title: title.trim() || undefined, description: description.trim() || undefined });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    onUpdated({ ...file, title: title.trim() || null, description: description.trim() || null });
  }

  async function handleReplaceFile(event: React.ChangeEvent<HTMLInputElement>) {
    const newFile = event.target.files?.[0];
    event.target.value = "";
    if (!newFile || !file) return;

    const validation = validateImageFile(newFile);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setReplacing(true);
    const formData = new FormData();
    formData.append("file", newFile);
    const result = await replaceMediaFileAction(file.id, formData);
    setReplacing(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Image replaced.");
    onUpdated({
      ...file,
      path: result.file.path,
      thumbnailPath: result.file.thumbnailPath,
      size: result.file.size,
      fileName: result.file.fileName,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="truncate">{file.title || file.fileName}</DialogTitle>
        </DialogHeader>

        <div className="bg-secondary/40 relative aspect-video overflow-hidden rounded-xl">
          {file.type === "IMAGE" ? (
            <FallbackImage src={file.path} alt={file.title ?? file.fileName} fill sizes="480px" className="object-contain" unoptimized />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              {file.type === "AUDIO" ? <Music className="size-10" /> : <FileText className="size-10" />}
            </div>
          )}
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>{file.fileName}</span>
          <span>{formatBytes(file.size)}</span>
          <span>Uploaded by {file.uploadedByName}</span>
          <span>{file.createdAt.toLocaleDateString()}</span>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="media-title">Title</Label>
            <Input id="media-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={file.fileName} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="media-description">Description</Label>
            <Textarea id="media-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional…" />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            {file.type === "IMAGE" && (
              <>
                <input ref={fileInputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleReplaceFile} />
                <Button type="button" variant="outline" size="sm" disabled={replacing} onClick={() => fileInputRef.current?.click()}>
                  {replacing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Replace
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={file.usageCount > 0}
              title={file.usageCount > 0 ? "Remove it from Reading/Listening/Articles first" : undefined}
              onClick={() => onDeleted(file.id)}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
