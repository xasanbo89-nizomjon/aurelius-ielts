"use client";

import { useRef, useState } from "react";
import { ExternalLink, FolderOpen, ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { uploadWritingTaskImageAction } from "@/actions/writing-tasks.actions";
import { IMAGE_INPUT_ACCEPT, WRITING_TASK_IMAGE_MAX_LABEL, validateWritingTaskImageFile } from "@/lib/uploads/image-constraints";
import { describeImage, type WritingTaskImage } from "@/lib/writing-task-image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FallbackImage } from "@/components/ui/fallback-image";
import { MediaFilePickerDialog } from "@/components/teacher/media-file-picker-dialog";

/**
 * Phase F — the Task 1 picture of a Writing task, in every place a teacher
 * builds one (the Writing assignments editor and the Full Mock builder). One
 * component, so the rules and the look are the same everywhere:
 *
 *  - Upload a JPG, JPEG, PNG or WEBP of up to 10MB (choose a file or drop one on the box).
 *  - See it right away, with its type, pixel size and file size.
 *  - Replace it with another, delete it, or open it full size.
 *
 * The file is checked here for a quick answer, and again on the server down to its
 * actual bytes. Nothing is attached to the task until the teacher saves it: the
 * parent holds `value` and sends only the Media Library file id with the form.
 * Removing or replacing a picture detaches it from the task; the file itself stays in
 * the teacher's Media Library, where it can be reused.
 */
export function WritingTaskImageField({
  value,
  onChange,
  disabled = false,
  showLibrary = true,
}: {
  value: WritingTaskImage | null;
  onChange: (value: WritingTaskImage | null) => void;
  disabled?: boolean;
  showLibrary?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const busy = disabled || uploading;

  async function upload(file: File) {
    setError(null);
    const validation = validateWritingTaskImageFile(file);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await uploadWritingTaskImageAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onChange(result.image);
      toast.success(result.image.reused ? "That picture was already in your library — using it." : value ? "Picture replaced." : "Picture uploaded.");
    } catch {
      setError("The upload didn't go through. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void upload(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <div data-testid="writing-image-field" className="space-y-2">
      <input ref={inputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleInputChange} data-testid="writing-image-input" />

      {value ? (
        <div className="border-border/70 bg-secondary/20 space-y-3 rounded-xl border p-3">
          <div className="bg-secondary/60 relative flex justify-center overflow-hidden rounded-lg p-2">
            <FallbackImage
              src={value.url}
              alt="Task 1 picture preview"
              width={value.width ?? 1200}
              height={value.height ?? 800}
              sizes="(min-width: 640px) 520px, 90vw"
              className="h-auto max-h-64 w-auto max-w-full object-contain"
              unoptimized
              data-testid="writing-image-preview"
            />
            {uploading && (
              <div className="bg-background/70 absolute inset-0 flex items-center justify-center" role="status">
                <Loader2 className="text-accent size-5 animate-spin" aria-label="Uploading" />
              </div>
            )}
          </div>
          <p data-testid="writing-image-meta" className="text-muted-foreground text-xs tabular-nums">
            {describeImage(value)}
            {value.fileName ? <span className="ml-1.5 break-all">· {value.fileName}</span> : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} data-testid="writing-image-replace">
              <RefreshCw className="size-3.5" /> Replace image
            </Button>
            {showLibrary && (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setPickerOpen(true)}>
                <FolderOpen className="size-3.5" /> Library
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setError(null);
                onChange(null);
              }}
              className="text-destructive hover:text-destructive"
              data-testid="writing-image-remove"
            >
              <Trash2 className="size-3.5" /> Remove
            </Button>
            <a
              href={value.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 text-xs underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden="true" /> Full size
            </a>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn("border-border/80 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors", dragging && "border-accent bg-accent/5")}
          data-testid="writing-image-dropzone"
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} data-testid="writing-image-upload">
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
              {uploading ? "Uploading…" : "Upload image"}
            </Button>
            {showLibrary && (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setPickerOpen(true)}>
                <FolderOpen className="size-3.5" /> Library
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">JPG, PNG or WEBP · up to {WRITING_TASK_IMAGE_MAX_LABEL} · or drop a file here</p>
        </div>
      )}

      {error && (
        <p role="alert" data-testid="writing-image-error" className="text-destructive text-xs">
          {error}
        </p>
      )}

      {showLibrary && (
        <MediaFilePickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(file) => {
            setError(null);
            onChange({ mediaFileId: file.id, url: file.path, type: file.mimeType, width: file.width, height: file.height, sizeBytes: file.size, fileName: file.fileName });
          }}
        />
      )}
    </div>
  );
}
