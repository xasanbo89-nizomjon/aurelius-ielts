"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { ArticleDifficulty } from "@prisma/client";

import {
  createReadingLibraryItemAction,
  updateReadingLibraryItemAction,
  prepareReadingLibraryPdfUploadAction,
  uploadReadingLibraryCoverAction,
} from "@/actions/reading-library.actions";
import { validateDocumentFile, DOCUMENT_INPUT_ACCEPT } from "@/lib/uploads/document-constraints";
import { validateImageFile, IMAGE_INPUT_ACCEPT } from "@/lib/uploads/image-constraints";
import { uploadToSignedUrl } from "@/lib/uploads/supabase-browser";
import { READING_LIBRARY_BUCKET } from "@/lib/uploads/bucket-names";
import { ARTICLE_DIFFICULTY_LABELS } from "@/lib/labels";
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

export type ExistingReadingLibraryItem = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  level: ArticleDifficulty;
  estimatedBand: number | null;
  wordCount: number | null;
  pdfPath: string;
  pdfFileName: string;
  coverImagePath: string | null;
};

export function ReadingLibraryItemEditorDialog({
  open,
  onOpenChange,
  existingItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingItem?: ExistingReadingLibraryItem;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState<ArticleDifficulty>("IELTS_ACADEMIC");
  const [estimatedBand, setEstimatedBand] = useState("");
  const [wordCount, setWordCount] = useState("");

  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfSize, setPdfSize] = useState<number>(0);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(existingItem?.title ?? "");
    setDescription(existingItem?.description ?? "");
    setCategory(existingItem?.category ?? "");
    setLevel(existingItem?.level ?? "IELTS_ACADEMIC");
    setEstimatedBand(existingItem?.estimatedBand != null ? String(existingItem.estimatedBand) : "");
    setWordCount(existingItem?.wordCount != null ? String(existingItem.wordCount) : "");
    setPdfPath(existingItem?.pdfPath ?? null);
    setPdfFileName(existingItem?.pdfFileName ?? null);
    setPdfSize(0);
    setCoverPath(existingItem?.coverImagePath ?? null);
  }, [open, existingItem]);

  async function handlePdfChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateDocumentFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploadingPdf(true);
    try {
      const prepared = await prepareReadingLibraryPdfUploadAction({ fileName: file.name, fileSize: file.size, contentType: validation.contentType });
      if (!prepared.success) {
        toast.error(prepared.error);
        return;
      }
      await uploadToSignedUrl(READING_LIBRARY_BUCKET, prepared.path, prepared.token, file, validation.contentType);
      setPdfPath(prepared.publicUrl);
      setPdfFileName(file.name);
      setPdfSize(file.size);
      toast.success("PDF uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the PDF.");
    } finally {
      setUploadingPdf(false);
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
    const result = await uploadReadingLibraryCoverAction(formData);
    setUploadingCover(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCoverPath(result.path);
    toast.success("Cover image uploaded.");
  }

  async function handleSubmit() {
    if (!pdfPath || !pdfFileName) {
      toast.error("Upload a PDF first.");
      return;
    }

    setSubmitting(true);
    const input = {
      title,
      description: description.trim() || undefined,
      category,
      level,
      estimatedBand: estimatedBand.trim() ? Number(estimatedBand) : undefined,
      wordCount: wordCount.trim() ? Number(wordCount) : undefined,
      pdfPath,
      pdfFileName,
      pdfSize: pdfSize || 1,
      coverImagePath: coverPath || undefined,
    };
    const result = existingItem
      ? await updateReadingLibraryItemAction(existingItem.id, input)
      : await createReadingLibraryItemAction(input);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(existingItem ? "Reading updated." : "Reading created as a draft.");
    onOpenChange(false);
  }

  const canSave = Boolean(title.trim() && category.trim() && pdfPath);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingItem ? "Edit reading" : "New reading"}</DialogTitle>
          <DialogDescription>Publish it separately when you&apos;re ready for students to see it.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reading-title">Title</Label>
            <Input id="reading-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Academic Reading Passage 1 — Climate Change" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reading-description">Description</Label>
            <Textarea id="reading-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reading-category">Category</Label>
              <Input id="reading-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Science, History, Nature…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reading-level">IELTS Level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as ArticleDifficulty)}>
                <SelectTrigger id="reading-level">
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="reading-band">Estimated band (optional)</Label>
              <Input id="reading-band" type="number" min={0} max={9} step={0.5} value={estimatedBand} onChange={(e) => setEstimatedBand(e.target.value)} placeholder="6.5" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reading-words">Word count (optional)</Label>
              <Input id="reading-words" type="number" min={1} value={wordCount} onChange={(e) => setWordCount(e.target.value)} placeholder="850" />
              <p className="text-muted-foreground text-[11px]">Powers the real estimated reading time shown to students.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>PDF</Label>
            <input ref={pdfInputRef} type="file" accept={DOCUMENT_INPUT_ACCEPT} className="hidden" onChange={handlePdfChange} />
            {pdfFileName ? (
              <div className="border-border/70 bg-secondary/20 flex items-center justify-between gap-2 rounded-xl border p-3">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <FileText className="text-accent size-4 shrink-0" />
                  <span className="truncate">{pdfFileName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPdfPath(null);
                    setPdfFileName(null);
                    setPdfSize(0);
                  }}
                  aria-label="Remove PDF"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={uploadingPdf} onClick={() => pdfInputRef.current?.click()}>
                {uploadingPdf ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Upload PDF
              </Button>
            )}
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
