"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed, FileAudio, FileUp, KeyRound, Loader2, Rocket, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";

import { analyzeImportedTestAction, createImportedTestAction, prepareTestImportPdfUploadAction } from "@/actions/pdf-test-import.actions";
import {
  analyzeQuickBuildWritingPdfAction,
  buildFullMockFromFilesAction,
  getQuickBuildImportReadinessAction,
  getQuickBuildSuggestionsAction,
  prepareQuickBuildAudioUploadAction,
  type BuildFullMockResult,
  type ImportReadinessResult,
} from "@/actions/full-mock-quick-build.actions";
import { estimateFullMockMinutes, formatMinutes, generateFullMockDescription } from "@/lib/full-mock-metadata";
import { FULL_MOCK_LISTENING_MINUTES, FULL_MOCK_LISTENING_TRANSFER_MINUTES, FULL_MOCK_READING_MINUTES, FULL_MOCK_WRITING_MINUTES } from "@/lib/full-mock-constants";
import { AUDIO_INPUT_ACCEPT, MAX_AUDIO_FILE_SIZE_LABEL, validateAudioFile } from "@/lib/uploads/audio-constraints";
import { DOCUMENT_INPUT_ACCEPT, MAX_DOCUMENT_FILE_SIZE_LABEL, validateDocumentFile } from "@/lib/uploads/document-constraints";
import { LISTENING_AUDIO_BUCKET, TEST_IMPORT_PDF_BUCKET } from "@/lib/uploads/bucket-names";
import { uploadToSignedUrl } from "@/lib/uploads/supabase-browser";
import type { ParsedWritingTask } from "@/lib/writing-task-pdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FileKey = "listeningPdf" | "listeningAudio" | "readingPdf" | "writingPdf";
type StepKey = "upload" | "reading" | "listening" | "writing" | "build";
type StepStatus = "pending" | "running" | "done" | "error";

const STEP_LABELS: Record<StepKey, string> = {
  upload: "Upload the four files",
  reading: "Read the Reading PDF — passages, questions, answer key",
  listening: "Read the Listening PDF — sections 1–4, questions, answer key",
  writing: "Read the Writing PDF — Task 1 and Task 2",
  build: "Build the Full Mock and link everything",
};
const STEP_ORDER: StepKey[] = ["upload", "reading", "listening", "writing", "build"];

const FILE_META: Record<FileKey, { label: string; hint: string; kind: "pdf" | "audio" }> = {
  listeningPdf: { label: "Listening PDF", hint: "Questions + answer key (text or scanned)", kind: "pdf" },
  listeningAudio: { label: "Listening audio", hint: `.mp3, .wav or .m4a, up to ${MAX_AUDIO_FILE_SIZE_LABEL}`, kind: "audio" },
  readingPdf: { label: "Reading PDF", hint: "3 passages + questions + answer key (text or scanned)", kind: "pdf" },
  writingPdf: { label: "Writing Task PDF", hint: 'Both tasks, each under a "WRITING TASK 1 / 2" heading', kind: "pdf" },
};

function FilePicker({ fileKey, file, disabled, onPick }: { fileKey: FileKey; file: File | null; disabled: boolean; onPick: (key: FileKey, file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const meta = FILE_META[fileKey];
  const Icon = meta.kind === "audio" ? FileAudio : FileUp;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{meta.label}</Label>
      <input
        ref={ref}
        type="file"
        accept={meta.kind === "audio" ? AUDIO_INPUT_ACCEPT : DOCUMENT_INPUT_ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected) onPick(fileKey, selected);
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        className="border-border/70 hover:bg-secondary/40 flex w-full items-center gap-2.5 rounded-xl border border-dashed px-3.5 py-3 text-left text-sm transition-colors disabled:opacity-60"
      >
        <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{file ? file.name : `Choose ${meta.label.toLowerCase()}`}</span>
          <span className="text-muted-foreground block truncate text-xs">{file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : meta.hint}</span>
        </span>
        {file && <CheckCircle2 className="text-success size-4 shrink-0" aria-hidden="true" />}
      </button>
    </div>
  );
}

function StepRow({ label, status, detail, children }: { label: string; status: StepStatus; detail?: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {status === "done" ? (
        <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : status === "running" ? (
        <Loader2 className="text-accent mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : status === "error" ? (
        <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CircleDashed className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className={status === "pending" ? "text-muted-foreground" : "font-medium"}>{label}</p>
        {detail && <p className={status === "error" ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>{detail}</p>}
        {children}
      </div>
    </li>
  );
}

type Uploaded = { listeningPdfPath: string; readingPdfPath: string; writingPdfPath: string; audio: { url: string; fileName: string; mimeType: string; size: number } };
type Imports = { readingId: string; listeningId: string };
type ImportInfo = { sections: { label: string; questionCount: number }[]; totalQuestions: number; answerCount: number };

/** "" or "unlimited" = no cap; otherwise a whole number >= 1. undefined = not valid. */
function parseUses(value: string): number | null | undefined {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed === "unlimited") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : undefined;
}

export function FullMockQuickBuilder() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"GENERAL" | "CAMBRIDGE">("GENERAL");
  const [phase, setPhase] = useState<"setup" | "review">("setup");
  const [building, setBuilding] = useState<false | "draft" | "publish">(false);
  const [info, setInfo] = useState<{ reading?: ImportInfo; listening?: ImportInfo }>({});
  const [description, setDescription] = useState("");
  const [examNumber, setExamNumber] = useState("");
  const [difficulty, setDifficulty] = useState<"NONE" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED">("NONE");
  const [bandMin, setBandMin] = useState("");
  const [bandMax, setBandMax] = useState("");
  const [wantCodes, setWantCodes] = useState(false);
  const [codeCount, setCodeCount] = useState("10");
  const [codeUses, setCodeUses] = useState("1");
  const [files, setFiles] = useState<Record<FileKey, File | null>>({ listeningPdf: null, listeningAudio: null, readingPdf: null, writingPdf: null });

  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<StepKey, StepStatus>>({ upload: "pending", reading: "pending", listening: "pending", writing: "pending", build: "pending" });
  const [details, setDetails] = useState<Partial<Record<StepKey, string>>>({});
  const [reviewLinks, setReviewLinks] = useState<Partial<Record<"reading" | "listening", string>>>({});
  const [result, setResult] = useState<Extract<BuildFullMockResult, { success: true }> | null>(null);

  // Everything already produced is kept, so a retry resumes at the failed step instead of re-uploading or re-reading what worked.
  const uploaded = useRef<Partial<Uploaded>>({});
  const imports = useRef<Partial<Imports>>({});
  /** Whether the AI/OCR analysis of an import already succeeded — so a retry after a failed analysis re-runs it on the SAME import instead of creating another. */
  const analyzed = useRef<Partial<Record<"reading" | "listening", boolean>>>({});
  const writingTasks = useRef<ParsedWritingTask[] | null>(null);

  function setStep(step: StepKey, status: StepStatus, detail?: string) {
    setStatuses((prev) => ({ ...prev, [step]: status }));
    setDetails((prev) => ({ ...prev, [step]: detail }));
  }

  function pickFile(key: FileKey, file: File) {
    const validation = FILE_META[key].kind === "audio" ? validateAudioFile(file) : validateDocumentFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    setFiles((prev) => ({ ...prev, [key]: file }));
    // A different file invalidates anything derived from the old one.
    uploaded.current = {};
    imports.current = {};
    analyzed.current = {};
    writingTasks.current = null;
    setStatuses({ upload: "pending", reading: "pending", listening: "pending", writing: "pending", build: "pending" });
    setDetails({});
    setReviewLinks({});
    setPhase("setup");
    setInfo({});
  }

  const allChosen = Object.values(files).every(Boolean) && title.trim().length >= 3;

  async function uploadPdf(file: File): Promise<string> {
    const contentType = file.type || "application/pdf";
    const prepared = await prepareTestImportPdfUploadAction({ fileName: file.name, fileSize: file.size, contentType });
    if (!prepared.success) throw new Error(prepared.error);
    await uploadToSignedUrl(TEST_IMPORT_PDF_BUCKET, prepared.path, prepared.token, file, contentType);
    return prepared.path;
  }

  async function stepUpload() {
    if (uploaded.current.audio && uploaded.current.readingPdfPath && uploaded.current.listeningPdfPath && uploaded.current.writingPdfPath) return;
    setStep("upload", "running", "Uploading…");
    const { readingPdf, listeningPdf, writingPdf, listeningAudio } = files;
    if (!readingPdf || !listeningPdf || !writingPdf || !listeningAudio) throw new Error("Choose all four files first.");

    const readingPdfPath = uploaded.current.readingPdfPath ?? (await uploadPdf(readingPdf));
    uploaded.current.readingPdfPath = readingPdfPath;
    const listeningPdfPath = uploaded.current.listeningPdfPath ?? (await uploadPdf(listeningPdf));
    uploaded.current.listeningPdfPath = listeningPdfPath;
    const writingPdfPath = uploaded.current.writingPdfPath ?? (await uploadPdf(writingPdf));
    uploaded.current.writingPdfPath = writingPdfPath;

    if (!uploaded.current.audio) {
      const contentType = listeningAudio.type || "audio/mpeg";
      const prepared = await prepareQuickBuildAudioUploadAction({ fileName: listeningAudio.name, fileSize: listeningAudio.size, contentType });
      if (!prepared.success) throw new Error(prepared.error);
      await uploadToSignedUrl(LISTENING_AUDIO_BUCKET, prepared.path, prepared.token, listeningAudio, contentType);
      uploaded.current.audio = { url: prepared.publicUrl, fileName: listeningAudio.name, mimeType: contentType, size: listeningAudio.size };
    }
    setStep("upload", "done", "All four files uploaded.");
  }

  /** Creates + analyses one PDF import (or reuses an earlier one) and returns its readiness. Throws with a readable message when it can't be built from. */
  async function stepImport(kind: "reading" | "listening") {
    const step = kind;
    const key = kind === "reading" ? "readingId" : "listeningId";
    setStep(step, "running", kind === "reading" ? "Reading the passages and questions…" : "Reading the sections — scanned pages are read automatically…");

    let importedTestId = imports.current[key];
    if (!importedTestId) {
      const created = await createImportedTestAction({
        type: kind === "reading" ? "READING" : "LISTENING",
        sourceFileName: (kind === "reading" ? files.readingPdf : files.listeningPdf)?.name ?? `${kind}.pdf`,
        pdfPath: kind === "reading" ? uploaded.current.readingPdfPath : uploaded.current.listeningPdfPath,
      });
      if (!created.success || !created.importedTestId) throw new Error(created.success ? "Could not start the import." : created.error);
      importedTestId = created.importedTestId;
      imports.current[key] = importedTestId;
    }

    if (!analyzed.current[kind]) {
      const analysis = await analyzeImportedTestAction(importedTestId);
      if (!analysis.success) throw new Error(analysis.error);
      analyzed.current[kind] = true;
    }

    const readiness: ImportReadinessResult = await getQuickBuildImportReadinessAction(importedTestId);
    if (!readiness.success) throw new Error(readiness.error);
    if (!readiness.ready) {
      setReviewLinks((prev) => ({ ...prev, [kind]: `/teacher/tests/import/${importedTestId}` }));
      throw new Error(
        `Not complete yet — found ${readiness.totalQuestions} questions and ${readiness.answerCount} answers. ${readiness.issues.slice(0, 2).join(" ")}`
      );
    }
    setReviewLinks((prev) => ({ ...prev, [kind]: undefined }));
    setInfo((prev) => ({ ...prev, [kind]: { sections: readiness.sections, totalQuestions: readiness.totalQuestions, answerCount: readiness.answerCount } }));
    setStep(step, "done", `${readiness.sections.length} ${kind === "reading" ? "passages" : "sections"} · ${readiness.totalQuestions} questions · ${readiness.answerCount} answers`);
  }

  async function stepWriting() {
    if (writingTasks.current) return;
    setStep("writing", "running", "Finding Task 1 and Task 2…");
    const analysis = await analyzeQuickBuildWritingPdfAction({ pdfPath: uploaded.current.writingPdfPath ?? "", title: title.trim() });
    if (!analysis.success) throw new Error(analysis.error);
    writingTasks.current = analysis.tasks;
    setStep("writing", "done", `Task 1 (${analysis.tasks.find((t) => t.taskNumber === "TASK_1")?.category.toLowerCase()}) and Task 2 (${analysis.tasks.find((t) => t.taskNumber === "TASK_2")?.category.toLowerCase().replace(/_/g, " ")})`);
  }

  /** Reads all four files and stops at the summary — nothing is created until the teacher confirms it. */
  async function prepare() {
    if (!allChosen || running) return;
    setRunning(true);
    setResult(null);

    const steps: [StepKey, () => Promise<void>][] = [
      ["upload", stepUpload],
      ["reading", () => stepImport("reading")],
      ["listening", () => stepImport("listening")],
      ["writing", stepWriting],
    ];

    for (const [key, action] of steps) {
      if (statuses[key] === "done") continue;
      try {
        await action();
      } catch (error) {
        setStep(key, "error", error instanceof Error ? error.message : "Something went wrong.");
        setRunning(false);
        return;
      }
    }

    const suggestions = await getQuickBuildSuggestionsAction();
    if (suggestions.success && !examNumber) setExamNumber(String(suggestions.nextExamNumber));
    setRunning(false);
    setPhase("review");
  }

  // The generated description follows the real counts until the teacher edits it by hand.
  const summary = {
    listeningParts: info.listening?.sections.length ?? 0,
    listeningQuestions: info.listening?.totalQuestions ?? 0,
    readingPassages: info.reading?.sections.length ?? 0,
    readingQuestions: info.reading?.totalQuestions ?? 0,
    writingTasks: writingTasks.current?.length ?? 0,
  };
  const generatedDescription = generateFullMockDescription(summary);
  const shownDescription = description || generatedDescription;

  async function build(publishNow: boolean) {
    if (building) return;
    const exam = examNumber.trim() === "" ? undefined : Number(examNumber);
    if (exam !== undefined && (!Number.isInteger(exam) || exam < 1)) return void toast.error("Mock number must be a whole number of at least 1.");
    const min = bandMin.trim() === "" ? undefined : Number(bandMin);
    const max = bandMax.trim() === "" ? undefined : Number(bandMax);
    if ((min !== undefined && (Number.isNaN(min) || min < 0 || min > 9)) || (max !== undefined && (Number.isNaN(max) || max < 0 || max > 9))) {
      return void toast.error("Estimated bands must be between 0 and 9.");
    }
    if (min !== undefined && max !== undefined && min > max) return void toast.error("The minimum estimated band can't be above the maximum.");
    let accessCodes: { count: number; maxRedemptions: number | null } | undefined;
    if (wantCodes) {
      const count = Number(codeCount);
      const uses = parseUses(codeUses);
      if (!Number.isInteger(count) || count < 1 || count > 200) return void toast.error("Create between 1 and 200 access codes.");
      if (uses === undefined) return void toast.error('Uses per code must be a whole number of at least 1, or "unlimited".');
      accessCodes = { count, maxRedemptions: uses };
    }

    setBuilding(publishNow ? "publish" : "draft");
    setStep("build", "running", "Creating the tests, attaching the audio, linking the sections…");
    const built = await buildFullMockFromFilesAction({
      title: title.trim(),
      description: shownDescription,
      category,
      difficulty: difficulty === "NONE" ? undefined : difficulty,
      examNumber: exam,
      estimatedBandMin: min,
      estimatedBandMax: max,
      readingImportId: imports.current.readingId,
      listeningImportId: imports.current.listeningId,
      audio: uploaded.current.audio,
      writingTasks: writingTasks.current,
      writingPdfPath: uploaded.current.writingPdfPath,
      publish: publishNow,
      accessCodes,
    });
    setBuilding(false);
    if (!built.success) {
      setStep("build", "error", built.error);
      toast.error(built.error);
      return;
    }
    setStep("build", "done", built.status === "PUBLISHED" ? "Published." : "Saved as a draft.");
    setResult(built);
  }

  const started = STEP_ORDER.some((step) => statuses[step] !== "pending");
  const failed = STEP_ORDER.find((step) => statuses[step] === "error");

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="quick-title" className="text-xs">
                Full Mock title
              </Label>
              <Input id="quick-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Cambridge Mock 14" disabled={running} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as "GENERAL" | "CAMBRIDGE")} disabled={running}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL">General (premium)</SelectItem>
                  <SelectItem value="CAMBRIDGE">Cambridge (free tier)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(FILE_META) as FileKey[]).map((key) => (
              <FilePicker key={key} fileKey={key} file={files[key]} disabled={running} onPick={pickFile} />
            ))}
          </div>
          <p className="text-muted-foreground text-xs">PDFs up to {MAX_DOCUMENT_FILE_SIZE_LABEL} each. Typed or scanned PDFs both work.</p>

          {phase === "setup" ? (
            <Button onClick={prepare} disabled={!allChosen || running} className="w-full sm:w-auto">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              {running ? "Reading your files — this can take a few minutes…" : failed ? "Retry from where it stopped" : "Read files & review"}
            </Button>
          ) : (
            !result && (
              <Button variant="outline" onClick={() => setPhase("setup")} disabled={Boolean(building)}>
                Change title, category or files
              </Button>
            )
          )}
        </CardContent>
      </Card>

      {started && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <ol className="space-y-3.5">
              {STEP_ORDER.map((step) => (
                <StepRow key={step} label={STEP_LABELS[step]} status={statuses[step]} detail={details[step]}>
                  {(step === "reading" || step === "listening") && statuses[step] === "error" && reviewLinks[step] && (
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                      <Link href={reviewLinks[step]!} target="_blank" className="text-accent underline">
                        Open the review screen to fix it
                      </Link>
                      <span className="text-muted-foreground">then press Retry here.</span>
                    </div>
                  )}
                </StepRow>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {phase === "review" && !result && (
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-medium">Review before you build</h2>
              <p className="text-muted-foreground text-sm">
                Listening, Reading and Writing are created together as one package — they can only be sat as part of this mock, with its access code.
              </p>
            </div>

            <ul className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Listening</strong> — {summary.listeningParts} parts · {summary.listeningQuestions} questions · {info.listening?.answerCount} answers
                  <span className="text-muted-foreground block text-xs">
                    Recording: {uploaded.current.audio?.fileName} ({((uploaded.current.audio?.size ?? 0) / (1024 * 1024)).toFixed(1)} MB), attached to every part
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Reading</strong> — {summary.readingPassages} passages · {summary.readingQuestions} questions · {info.reading?.answerCount} answers
                  <span className="text-muted-foreground block text-xs">{info.reading?.sections.map((section) => `${section.label}: ${section.questionCount}`).join(" · ")}</span>
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <strong>Writing</strong> — Task 1 ({writingTasks.current?.find((t) => t.taskNumber === "TASK_1")?.category.toLowerCase().replace(/_/g, " ")}) and Task 2 (
                  {writingTasks.current?.find((t) => t.taskNumber === "TASK_2")?.category.toLowerCase().replace(/_/g, " ")})
                  <details className="text-muted-foreground mt-1 text-xs">
                    <summary className="cursor-pointer select-none">Show the task wording</summary>
                    {writingTasks.current?.map((task) => (
                      <p key={task.taskNumber} className="mt-1.5 whitespace-pre-line">
                        <strong>{task.taskNumber === "TASK_1" ? "Task 1" : "Task 2"}:</strong> {task.prompt}
                      </p>
                    ))}
                  </details>
                </span>
              </li>
            </ul>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="quick-exam-number" className="text-xs">
                  Mock number
                </Label>
                <Input id="quick-exam-number" inputMode="numeric" value={examNumber} onChange={(event) => setExamNumber(event.target.value)} placeholder="e.g. 14" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Difficulty</Label>
                <Select value={difficulty} onValueChange={(value) => setDifficulty(value as typeof difficulty)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Not set</SelectItem>
                    <SelectItem value="BEGINNER">Beginner</SelectItem>
                    <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                    <SelectItem value="ADVANCED">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-band-min" className="text-xs">
                  Estimated band (min)
                </Label>
                <Input id="quick-band-min" inputMode="decimal" value={bandMin} onChange={(event) => setBandMin(event.target.value)} placeholder="e.g. 6.0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-band-max" className="text-xs">
                  Estimated band (max)
                </Label>
                <Input id="quick-band-max" inputMode="decimal" value={bandMax} onChange={(event) => setBandMax(event.target.value)} placeholder="e.g. 7.5" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="quick-description" className="text-xs">
                  Description (generated from the real counts — edit if you like)
                </Label>
                {description && (
                  <button type="button" className="text-accent text-xs underline" onClick={() => setDescription("")}>
                    Use the generated one
                  </button>
                )}
              </div>
              <Textarea id="quick-description" rows={3} value={shownDescription} onChange={(event) => setDescription(event.target.value)} />
              <p className="text-muted-foreground text-xs">
                Total time: about {formatMinutes(estimateFullMockMinutes(summary))} (Listening {FULL_MOCK_LISTENING_MINUTES} min + {FULL_MOCK_LISTENING_TRANSFER_MINUTES} min transfer, Reading {FULL_MOCK_READING_MINUTES} min, Writing {FULL_MOCK_WRITING_MINUTES} min).
              </p>
            </div>

            <div className="border-border/70 space-y-3 rounded-xl border p-4">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 size-4" checked={wantCodes} onChange={(event) => setWantCodes(event.target.checked)} />
                <span>
                  Create access codes now
                  <span className="text-muted-foreground block text-xs">Students need a code to start this mock. You can always make more later from the mock&apos;s access-codes page.</span>
                </span>
              </label>
              {wantCodes && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-code-count" className="text-xs">
                      How many codes
                    </Label>
                    <Input id="quick-code-count" inputMode="numeric" value={codeCount} onChange={(event) => setCodeCount(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-code-uses" className="text-xs">
                      Students per code
                    </Label>
                    <Input id="quick-code-uses" value={codeUses} onChange={(event) => setCodeUses(event.target.value)} placeholder="1, 30 or unlimited" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => build(true)} disabled={Boolean(building)}>
                {building === "publish" ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
                Build &amp; publish
              </Button>
              <Button variant="outline" onClick={() => build(false)} disabled={Boolean(building)}>
                {building === "draft" && <Loader2 className="size-4 animate-spin" />}
                Build as draft
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">Nothing has been created yet. If anything fails while building, everything it created is taken back out.</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-success size-5" aria-hidden="true" />
              <h2 className="font-display text-lg font-medium">{title.trim()} is ready</h2>
            </div>
            <ul className="text-muted-foreground space-y-1 text-sm">
              <li>
                Listening: {result.listeningQuestions} questions across {result.audioSections} sections, one recording attached to all of them
              </li>
              <li>Reading: {result.readingQuestions} questions</li>
              <li>Writing: Task 1 and Task 2</li>
              <li>Status: {result.status === "PUBLISHED" ? "Published" : "Draft — open it in the builder to publish"}</li>
            </ul>
            {result.unmatchedAnswerCount > 0 && (
              <p className="text-destructive flex items-start gap-1.5 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {result.unmatchedAnswerCount} answer{result.unmatchedAnswerCount === 1 ? "" : "s"} couldn&apos;t be matched to the key — check them in the test editor.
              </p>
            )}
            {result.accessCodes.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">
                  {result.accessCodes.length} access code{result.accessCodes.length === 1 ? "" : "s"}
                </p>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-xs sm:grid-cols-3">
                  {result.accessCodes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => navigator.clipboard.writeText(code).then(() => toast.success(`${code} copied.`), () => toast.error("Could not copy."))}
                      className="bg-secondary/50 hover:bg-secondary rounded-lg px-2.5 py-1.5 text-left transition-colors"
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Writing Task 1&apos;s chart or picture can&apos;t be read from a PDF — add it to the task in the builder&apos;s Writing step if the task needs one.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/teacher/tests/full-mock/${result.fullMockTestId}/access-codes`}>
                  <KeyRound className="size-4" /> Manage access codes
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/teacher/tests/full-mock/${result.fullMockTestId}`}>Open in builder</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/teacher/mock-results">
                  <Trophy className="size-4" /> Mock Results
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
