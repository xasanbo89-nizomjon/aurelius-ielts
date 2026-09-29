"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import type { MediaFileType } from "@prisma/client";
import { FileText, Folder, FolderPlus, Loader2, Music, Search, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import {
  createMediaFolderAction,
  deleteMediaFileAction,
  deleteMediaFolderAction,
  listMediaFilesAction,
  uploadMediaFileAction,
} from "@/actions/media-library.actions";
import type { MediaFileRow } from "@/lib/media-library";
import { IMAGE_INPUT_ACCEPT, validateImageFile } from "@/lib/uploads/image-constraints";
import { AUDIO_INPUT_ACCEPT, validateAudioFile } from "@/lib/uploads/audio-constraints";
import { DOCUMENT_INPUT_ACCEPT, validateDocumentFile } from "@/lib/uploads/document-constraints";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const TYPE_FILTERS: { value: MediaFileType | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "IMAGE", label: "Image" },
  { value: "AUDIO", label: "Audio" },
  { value: "PDF", label: "PDF" },
];

/** Client-side sniff so the teacher never has to pick a "kind" manually — tries each real validator in turn, the same allowlists the server re-checks authoritatively. */
function detectKind(file: File): "image" | "audio" | "document" | null {
  if (validateImageFile(file).valid) return "image";
  if (validateAudioFile(file).valid) return "audio";
  if (validateDocumentFile(file).valid) return "document";
  return null;
}

export function MediaLibraryManager({
  initialFiles,
  folders,
  storageUsage,
}: {
  initialFiles: MediaFileRow[];
  folders: { id: string; name: string; fileCount: number }[];
  storageUsage: { usedBytes: number; quotaBytes: number | null };
}) {
  const [files, setFiles] = useState(initialFiles);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MediaFileType | "ALL">("ALL");
  const [folderFilter, setFolderFilter] = useState<string | "ALL">("ALL");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const usedPercent = storageUsage.quotaBytes ? Math.min(100, Math.round((storageUsage.usedBytes / storageUsage.quotaBytes) * 100)) : 0;

  async function refresh(nextSearch = search, nextType = typeFilter, nextFolder = folderFilter) {
    const result = await listMediaFilesAction({
      search: nextSearch || undefined,
      type: nextType === "ALL" ? undefined : nextType,
      folderId: nextFolder === "ALL" ? undefined : nextFolder,
    });
    if (result.success) setFiles(result.files);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const kind = detectKind(file);
    if (!kind) {
      toast.error("Only images (.jpg/.png/.webp), audio (.mp3/.wav/.m4a), and PDFs are supported.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    if (folderFilter !== "ALL") formData.append("folderId", folderFilter);
    const result = await uploadMediaFileAction(formData);
    setUploading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${file.name}" uploaded.`);
    await refresh();
  }

  async function handleDelete(fileId: string) {
    setDeletingId(fileId);
    const result = await deleteMediaFileAction(fileId);
    setDeletingId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    toast.success("File deleted.");
  }

  async function handleDeleteFolder(folderId: string) {
    const result = await deleteMediaFolderAction(folderId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Folder deleted.");
    if (folderFilter === folderId) setFolderFilter("ALL");
    startTransition(() => window.location.reload());
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const result = await createMediaFolderAction(newFolderName);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Folder created.");
    setNewFolderName("");
    setFolderDialogOpen(false);
    startTransition(() => window.location.reload()); // simplest correct refresh for the folder sidebar's counts
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-2 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Storage used</span>
            <span className="text-muted-foreground">
              {formatBytes(storageUsage.usedBytes)} {storageUsage.quotaBytes ? `of ${formatBytes(storageUsage.quotaBytes)}` : "· Unlimited"}
            </span>
          </div>
          {storageUsage.quotaBytes && <Progress value={usedPercent} className="h-1.5" />}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" accept={`${IMAGE_INPUT_ACCEPT},${AUDIO_INPUT_ACCEPT},${DOCUMENT_INPUT_ACCEPT}`} onChange={handleFileChange} />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload
          </Button>
          <Button variant="outline" onClick={() => setFolderDialogOpen(true)}>
            <FolderPlus className="size-4" /> New Folder
          </Button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              const value = event.target.value;
              setSearch(value);
              if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
              searchTimeoutRef.current = setTimeout(() => void refresh(value, typeFilter, folderFilter), 300);
            }}
            placeholder="Search by file name…"
            aria-label="Search media files"
            className="border-input bg-card placeholder:text-muted-foreground h-11 w-full rounded-xl border py-2 pr-4 pl-10 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => {
              setTypeFilter(filter.value);
              void refresh(search, filter.value, folderFilter);
            }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              typeFilter === filter.value ? "bg-primary text-primary-foreground border-transparent" : "border-border/70 hover:bg-secondary/60"
            )}
          >
            {filter.label}
          </button>
        ))}
        <span className="bg-border mx-1 h-4 w-px" aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            setFolderFilter("ALL");
            void refresh(search, typeFilter, "ALL");
          }}
          className={cn(
            "flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
            folderFilter === "ALL" ? "bg-primary text-primary-foreground border-transparent" : "border-border/70 hover:bg-secondary/60"
          )}
        >
          <Folder className="size-3" /> All folders
        </button>
        {folders.map((folder) => (
          <span
            key={folder.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              folderFilter === folder.id ? "bg-primary text-primary-foreground border-transparent" : "border-border/70"
            )}
          >
            <button
              type="button"
              onClick={() => {
                setFolderFilter(folder.id);
                void refresh(search, typeFilter, folder.id);
              }}
              className="flex items-center gap-1 hover:opacity-80"
            >
              <Folder className="size-3" /> {folder.name} ({folder.fileCount})
            </button>
            {folder.fileCount === 0 && (
              <button type="button" onClick={() => handleDeleteFolder(folder.id)} aria-label={`Delete folder ${folder.name}`} className="opacity-60 hover:opacity-100">
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {files.length === 0 ? (
        <EmptyState icon={Upload} title="No files yet" description="Upload an image, audio file, or PDF to get started." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((file) => (
            <Card key={file.id} className="overflow-hidden py-0">
              <div className="bg-secondary/40 relative aspect-video">
                {file.type === "IMAGE" ? (
                  <Image src={file.thumbnailPath ?? file.path} alt={file.fileName} fill sizes="200px" className="object-cover" unoptimized />
                ) : (
                  <div className="text-muted-foreground flex h-full items-center justify-center">
                    {file.type === "AUDIO" ? <Music className="size-8" /> : <FileText className="size-8" />}
                  </div>
                )}
              </div>
              <CardContent className="space-y-1.5 py-3">
                <p className="truncate text-xs font-medium" title={file.fileName}>
                  {file.fileName}
                </p>
                <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                  <span>{formatBytes(file.size)}</span>
                  {file.usageCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      Used ×{file.usageCount}
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive w-full"
                  onClick={() => handleDelete(file.id)}
                  disabled={deletingId === file.id || file.usageCount > 0}
                  title={file.usageCount > 0 ? "Remove it from Reading/Listening/Articles first" : undefined}
                >
                  {deletingId === file.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">Folder name</Label>
            <Input id="folder-name" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Reading" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
