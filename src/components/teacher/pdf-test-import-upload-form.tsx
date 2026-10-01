"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { analyzeImportedTestAction, createImportedTestAction, prepareTestImportPdfUploadAction } from "@/actions/pdf-test-import.actions";
import { DOCUMENT_INPUT_ACCEPT, MAX_DOCUMENT_FILE_SIZE_LABEL, validateDocumentFile } from "@/lib/uploads/document-constraints";
import { uploadToSignedUrl } from "@/lib/uploads/supabase-browser";
import { TEST_IMPORT_PDF_BUCKET } from "@/lib/uploads/bucket-names";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Stage = "idle" | "uploading" | "analyzing";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "Analyze PDF",
  uploading: "Uploading…",
  analyzing: "Analyzing PDF — this can take up to a minute…",
};

export function PdfTestImportUploadForm() {
  const router = useRouter();
  const [type, setType] = useState<"READING" | "LISTENING">("READING");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    const validation = validateDocumentFile(selected);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    setFile(selected);
  }

  async function handleAnalyze() {
    if (!file) {
      toast.error("Choose a PDF first.");
      return;
    }

    setStage("uploading");
    const contentType = file.type || "application/pdf";
    const prepared = await prepareTestImportPdfUploadAction({ fileName: file.name, fileSize: file.size, contentType });
    if (!prepared.success) {
      toast.error(prepared.error);
      setStage("idle");
      return;
    }

    try {
      await uploadToSignedUrl(TEST_IMPORT_PDF_BUCKET, prepared.path, prepared.token, file, contentType);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
      setStage("idle");
      return;
    }

    const created = await createImportedTestAction({ type, sourceFileName: file.name, pdfPath: prepared.path });
    if (!created.success || !created.importedTestId) {
      toast.error(!created.success ? created.error : "Could not start the import.");
      setStage("idle");
      return;
    }

    setStage("analyzing");
    const analyzed = await analyzeImportedTestAction(created.importedTestId);
    if (!analyzed.success) {
      toast.error(analyzed.error);
    }
    router.push(`/teacher/tests/import/${created.importedTestId}`);
  }

  const busy = stage !== "idle";

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div className="space-y-2">
          <Label>Test type</Label>
          <RadioGroup value={type} onValueChange={(value) => setType(value as "READING" | "LISTENING")} className="flex gap-5" disabled={busy}>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="READING" /> Reading
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="LISTENING" /> Listening
            </label>
          </RadioGroup>
          {type === "LISTENING" && (
            <p className="text-muted-foreground text-xs">
              PDF import extracts the transcript and questions only — audio must still be uploaded separately afterward, from the test editor.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>IELTS test PDF</Label>
          <input ref={fileInputRef} type="file" accept={DOCUMENT_INPUT_ACCEPT} className="hidden" onChange={handleFileChange} disabled={busy} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="border-border/70 hover:bg-secondary/40 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm transition-colors disabled:opacity-60"
          >
            <FileUp className="size-4" aria-hidden="true" />
            {file ? file.name : `Click to choose a PDF (up to ${MAX_DOCUMENT_FILE_SIZE_LABEL})`}
          </button>
        </div>

        <Button onClick={handleAnalyze} disabled={busy || !file} className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {STAGE_LABEL[stage]}
        </Button>
      </CardContent>
    </Card>
  );
}
