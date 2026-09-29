"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { listMediaFilesAction } from "@/actions/media-library.actions";
import type { MediaFileRow } from "@/lib/media-library";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/empty-state";

/** Phase 38 — Part 6's Media Reuse System: pick an existing image from the Media Library instead of uploading a duplicate. */
export function MediaFilePickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (file: MediaFileRow) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<MediaFileRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void listMediaFilesAction({ type: "IMAGE" }).then((result) => {
      setLoading(false);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setFiles(result.files);
    });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose from Media Library</DialogTitle>
          <DialogDescription>Reuse an image you already uploaded — no duplicate upload.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <EmptyState icon={ImageIcon} title="No images in your library yet" description="Upload an image from the Media Library first." />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => {
                  onSelect(file);
                  onOpenChange(false);
                }}
                className="focus-visible:ring-ring/50 group relative aspect-video overflow-hidden rounded-xl outline-none focus-visible:ring-2"
              >
                <Image
                  src={file.thumbnailPath ?? file.path}
                  alt={file.fileName}
                  fill
                  sizes="150px"
                  className="object-cover transition-transform group-hover:scale-105"
                  unoptimized
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[10px] text-white">{file.fileName}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
