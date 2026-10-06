"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { inspectWritingPdfAction, prepareWritingPdfUploadAction, previewWritingPdfPageAction } from "@/actions/writing-bundle.actions";
import { WRITING_TASK_PDF_BUCKET } from "@/lib/uploads/bucket-names";
import { uploadToSignedUrl } from "@/lib/uploads/supabase-browser";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** The PDF a Task 1 picture comes from, and which page of it. The page itself is drawn (as a PNG) on the server when the task is saved. */
export type PdfVisualChoice = { pdfUrl: string; fileName: string; pageCount: number; page: number };

const MAX_BYTES = 10 * 1024 * 1024;

const kilobytes = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * "Use a page of a PDF as the Task 1 picture": upload the PDF (straight to storage), pick the page from a row of thumbnails, and see the page exactly as
 * it will be saved - a PNG - before anything is stored. Nothing is attached to a task until the Writing test is saved.
 */
export function WritingPdfVisualField({ value, onChange, disabled = false }: { value: PdfVisualChoice | null; onChange: (value: PdfVisualChoice | null) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<{ page: number; dataUrl: string }[]>([]);
  const [preview, setPreview] = useState<{ dataUrl: string; width: number; height: number; sizeBytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function drawPage(pdfUrl: string, page: number) {
    setBusy("Drawing the page…");
    const result = await previewWritingPdfPageAction(pdfUrl, page);
    setBusy(null);
    if (!result.success) {
      setError(result.error);
      setPreview(null);
      return false;
    }
    setError(null);
    setPreview({ dataUrl: result.dataUrl, width: result.width, height: result.height, sizeBytes: result.sizeBytes });
    return true;
  }

  async function upload(file: File) {
    setError(null);
    if (!/\.pdf$/i.test(file.name)) return setError("Choose a PDF file.");
    if (file.size > MAX_BYTES) return setError("That PDF is larger than 10MB. Export the page you need on its own and upload that.");
    try {
      setBusy("Uploading the PDF…");
      const prepared = await prepareWritingPdfUploadAction({ fileName: file.name, fileSize: file.size });
      if (!prepared.success) throw new Error(prepared.error);
      await uploadToSignedUrl(WRITING_TASK_PDF_BUCKET, prepared.path, prepared.token, file, "application/pdf");
      setBusy("Reading the pages…");
      const inspected = await inspectWritingPdfAction(prepared.publicUrl);
      if (!inspected.success) throw new Error(inspected.error);
      setThumbs(inspected.thumbnails);
      onChange({ pdfUrl: prepared.publicUrl, fileName: file.name, pageCount: inspected.pageCount, page: 1 });
      await drawPage(prepared.publicUrl, 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not use that PDF.");
      toast.error("Could not use that PDF.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function choose(page: number) {
    if (!value || page === value.page) return;
    onChange({ ...value, page });
    await drawPage(value.pdfUrl, page);
  }

  return (
    <div className="space-y-3" data-testid="pdf-visual-field">
      <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" data-testid="pdf-visual-input" onChange={(event) => event.target.files?.[0] && void upload(event.target.files[0])} />

      {!value ? (
        <div className="border-border/80 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center">
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy !== null} onClick={() => inputRef.current?.click()} data-testid="pdf-visual-upload">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />} {busy ?? "Upload a PDF"}
          </Button>
          <p className="text-muted-foreground text-xs">A PDF of up to 10MB. You choose the page; it is saved as a picture (PNG) and the original PDF is kept.</p>
        </div>
      ) : (
        <div className="border-border/70 bg-secondary/20 space-y-3 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FileText className="size-4" aria-hidden="true" />
            <span className="font-medium break-all">{value.fileName}</span>
            <span className="text-muted-foreground tabular-nums">
              page {value.page} of {value.pageCount}
            </span>
            <a href={value.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 text-xs underline-offset-2 hover:underline">
              <ExternalLink className="size-3" aria-hidden="true" /> Original PDF
            </a>
          </div>

          {value.pageCount > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Choose the page" data-testid="pdf-pages">
              {thumbs.map((thumb) => (
                <button
                  key={thumb.page}
                  type="button"
                  role="radio"
                  aria-checked={thumb.page === value.page}
                  aria-label={`Page ${thumb.page}`}
                  disabled={disabled || busy !== null}
                  onClick={() => void choose(thumb.page)}
                  className={cn("bg-background shrink-0 overflow-hidden rounded-md border-2 p-0.5", thumb.page === value.page ? "border-accent" : "border-transparent hover:border-border")}
                  data-testid="pdf-page-thumb"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a base64 preview, not a hosted image */}
                  <img src={thumb.dataUrl} alt="" className="h-28 w-auto" />
                  <span className="text-muted-foreground block text-center text-[11px]">{thumb.page}</span>
                </button>
              ))}
              {value.pageCount > thumbs.length && (
                <label className="text-muted-foreground flex shrink-0 items-center gap-1.5 self-center text-xs">
                  Page
                  <input
                    type="number"
                    min={1}
                    max={value.pageCount}
                    defaultValue={value.page}
                    className="border-input bg-background w-16 rounded-md border px-2 py-1"
                    onBlur={(event) => {
                      const page = Math.min(value.pageCount, Math.max(1, Number(event.target.value) || 1));
                      void choose(page);
                    }}
                  />
                </label>
              )}
            </div>
          )}

          <div className="bg-secondary/60 relative flex min-h-24 justify-center overflow-hidden rounded-lg p-2">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element -- a base64 preview, not a hosted image
              <img src={preview.dataUrl} alt={`Page ${value.page} as it will be saved`} className="h-auto max-h-96 w-auto max-w-full object-contain" data-testid="pdf-page-preview" />
            )}
            {busy && (
              <div className="bg-background/70 absolute inset-0 flex items-center justify-center gap-2 text-sm" role="status">
                <Loader2 className="text-accent size-5 animate-spin" /> {busy}
              </div>
            )}
          </div>
          {preview && (
            <p className="text-muted-foreground text-xs tabular-nums" data-testid="pdf-page-meta">
              Saved as a PNG picture · {preview.width} × {preview.height} px · {kilobytes(preview.sizeBytes)}
            </p>
          )}
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy !== null} onClick={() => inputRef.current?.click()}>
            <RefreshCw className="size-3.5" /> Use another PDF
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive text-xs" data-testid="pdf-visual-error">
          {error}
        </p>
      )}
    </div>
  );
}
