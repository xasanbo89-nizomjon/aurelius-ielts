import "server-only";
import { randomUUID } from "crypto";
import type { MockTestCategory, MockTestDifficulty } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { downloadFromSupabase, createSignedUploadUrl, listBucketFolder, type SignedUpload } from "@/lib/uploads/supabase";
import { LISTENING_AUDIO_BUCKET, TEST_IMPORT_PDF_BUCKET } from "@/lib/uploads/bucket-names";
import { validateAudioFile } from "@/lib/uploads/audio-constraints";
import { parseStoredFileLocation } from "@/lib/uploads/storage-locations";
import { extractPdfText } from "@/lib/pdf-text-extraction";
import { parseWritingTasksFromText, type ParsedWritingTask } from "@/lib/writing-task-pdf";
import { confirmImport, getImportedTestForReview, validateImportedTestRows } from "@/lib/pdf-test-import";
import * as tm from "@/lib/exam/test-management";
import { scheduleRecordingMeasure } from "@/lib/exam/recording-length";
import { authorScope } from "@/lib/exam/test-access";
import { createWritingTask } from "@/lib/writing-tasks";
import { createFullMockTest, publishFullMockTest } from "@/lib/full-mock-tests";
import { QUICK_BUILD_LISTENING_MINUTES, QUICK_BUILD_READING_MINUTES } from "@/lib/full-mock-metadata";
import { createBulkMockAccessCodes } from "@/lib/mock-access-codes";
import { deleteStoredFilesIfUnreferenced } from "@/lib/exam/test-management";
import { deleteBucketObjects } from "@/lib/uploads/storage-cleanup";

/**
 * Phase A — Full Mock Builder, one-shot. The teacher hands over four files
 * (Listening PDF, Listening audio, Reading PDF, Writing Task PDF) and this
 * module turns them into a linked Listening + Reading + Writing Full Mock.
 * It adds no new content model and no new scoring: every piece is built by the
 * same functions the manual builder and the PDF importer already use
 * (confirmImport, createFullMockTest, createWritingTask, publishFullMockTest),
 * so the result is indistinguishable from a hand-built mock.
 */

const DEFAULT_READING_MINUTES = QUICK_BUILD_READING_MINUTES;
const DEFAULT_LISTENING_MINUTES = QUICK_BUILD_LISTENING_MINUTES;

// ---------------------------------------------------------------------------
// Audio upload (browser -> Storage directly, like every other large file here)
// ---------------------------------------------------------------------------

export async function prepareListeningAudioUpload(teacherId: string, file: { name: string; size: number; type?: string }): Promise<SignedUpload> {
  const validation = validateAudioFile(file);
  if (!validation.valid) throw new Error(validation.error);
  return createSignedUploadUrl(LISTENING_AUDIO_BUCKET, `${teacherId}/${randomUUID()}${validation.extension}`);
}

export type UploadedListeningAudio = { url: string; fileName: string; mimeType: string; size: number };

/** The audio URL must be an object this teacher just uploaded to the listening bucket — never an arbitrary URL, and never another teacher's file. */
export function assertOwnListeningAudio(teacherId: string, audio: UploadedListeningAudio) {
  const location = parseStoredFileLocation(audio.url);
  if (!location || location.kind !== "supabase" || location.bucket !== LISTENING_AUDIO_BUCKET || !location.path.startsWith(`${teacherId}/`)) {
    throw new Error("That audio file wasn't uploaded correctly. Please upload it again.");
  }
}

/**
 * A Listening test is ONE continuous recording, but the exam screen shows it
 * one section at a time — so the same recording is attached to every section.
 * It's a single stored object referenced several times; the exam screen keeps
 * the same player mounted across sections, so playback continues without a
 * restart when the student moves between parts.
 */
export async function attachListeningAudio(mockTestId: string, teacherId: string, audio: UploadedListeningAudio): Promise<number> {
  assertOwnListeningAudio(teacherId, audio);
  // Phase L - a Root Teacher may attach a recording to any teacher's test.
  const test = await prisma.mockTest.findFirst({ where: { id: mockTestId, ...(await authorScope(teacherId)), type: "LISTENING" }, select: { id: true } });
  if (!test) throw new Error("Listening test not found.");

  const updated = await prisma.passage.updateMany({
    where: { mockTestId },
    data: { audioPath: audio.url, audioFileName: audio.fileName.slice(0, 255), audioMimeType: audio.mimeType, audioSize: audio.size, audioDurationSeconds: null },
  });
  if (updated.count === 0) throw new Error("The Listening test has no sections to attach the audio to.");
  // Phase K - the recording's length is measured on the server once the response is out.
  scheduleRecordingMeasure(mockTestId);
  return updated.count;
}

// ---------------------------------------------------------------------------
// Readiness of an analysed PDF import
// ---------------------------------------------------------------------------

export type ImportReadiness = {
  importedTestId: string;
  type: "READING" | "LISTENING";
  status: string;
  errorMessage: string | null;
  /** Every question accounted for and matched to an answer — the same gate confirmImport enforces. */
  ready: boolean;
  totalQuestions: number;
  answerCount: number;
  sections: { label: string; questionCount: number }[];
  issues: string[];
};

export async function getImportReadiness(importedTestId: string, teacherId: string): Promise<ImportReadiness> {
  const imported = await getImportedTestForReview(importedTestId, teacherId);
  const validation = validateImportedTestRows(imported);
  const analysed = imported.status === "PARSED" || imported.status === "IMPORTED";

  return {
    importedTestId,
    type: imported.type === "LISTENING" ? "LISTENING" : "READING",
    status: imported.status,
    errorMessage: imported.errorMessage,
    ready: analysed && validation.ok,
    totalQuestions: validation.totalQuestions,
    answerCount: validation.answerCount,
    sections: validation.passages.map((passage) => ({ label: passage.label, questionCount: passage.questionCount })),
    issues: analysed ? validation.issues.map((issue) => issue.message) : [imported.errorMessage ?? "This PDF hasn't been analysed yet."],
  };
}

// ---------------------------------------------------------------------------
// Writing task PDF
// ---------------------------------------------------------------------------

export type WritingPdfAnalysis = { tasks: ParsedWritingTask[]; problems: string[]; ocrPageCount: number };

export async function analyzeWritingTaskPdf(teacherId: string, pdfPath: string, mockTitle: string): Promise<WritingPdfAnalysis> {
  // The PDF was uploaded to this teacher's own folder; refuse any other path.
  if (!pdfPath.startsWith(`${teacherId}/`)) throw new Error("That file wasn't uploaded correctly. Please upload it again.");
  const buffer = await downloadFromSupabase(TEST_IMPORT_PDF_BUCKET, pdfPath);
  const { text, ocrPageCount } = await extractPdfText(buffer);
  const parsed = parseWritingTasksFromText(text, mockTitle);
  return { tasks: parsed.tasks, problems: parsed.problems, ocrPageCount };
}

// ---------------------------------------------------------------------------
// Metadata (generated, shown to the teacher before anything is built)
// ---------------------------------------------------------------------------

/** The next free "Mock #" for this teacher (their highest existing exam number + 1). */
export async function suggestNextExamNumber(teacherId: string): Promise<number> {
  const top = await prisma.fullMockTest.aggregate({ where: { createdById: teacherId }, _max: { examNumber: true } });
  return (top._max.examNumber ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export type QuickBuildInput = {
  title: string;
  description?: string;
  category: MockTestCategory;
  difficulty?: MockTestDifficulty;
  examNumber?: number;
  estimatedBandMin?: number;
  estimatedBandMax?: number;
  readingImportId: string;
  listeningImportId: string;
  audio: UploadedListeningAudio;
  writingTasks: ParsedWritingTask[];
  publish: boolean;
  /** The uploaded Writing PDF (storage path). Its tasks are copied into the mock, so the file itself is deleted once the build succeeds — nothing else ever points at it. */
  writingPdfPath?: string;
  /** Also generate access codes for the new mock (works with the existing Mock Access Code system; maxRedemptions null = unlimited, 1 = one student per code). */
  accessCodes?: { count: number; maxRedemptions: number | null };
};

export type QuickBuildResult = {
  fullMockTestId: string;
  readingMockTestId: string;
  listeningMockTestId: string;
  status: "DRAFT" | "PUBLISHED";
  readingQuestions: number;
  listeningQuestions: number;
  writingTasks: number;
  audioSections: number;
  unmatchedAnswerCount: number;
  accessCodes: string[];
};

type EnsuredImport = { mockTestId: string; unmatched: number; /** true when THIS call created the test (so a failure later can take it back out) */ created: boolean };

/** Returns the MockTest an import became — importing it now if it hasn't been, reusing it if a previous attempt of this build already did. */
async function ensureImported(importedTestId: string, teacherId: string, title: string, durationMinutes: number, category: MockTestCategory): Promise<EnsuredImport> {
  const row = await prisma.importedTest.findFirst({ where: { id: importedTestId, teacherId }, select: { status: true, resultMockTestId: true } });
  if (!row) throw new Error("That import wasn't found.");
  if (row.status === "IMPORTED" && row.resultMockTestId) return { mockTestId: row.resultMockTestId, unmatched: 0, created: false };

  const result = await confirmImport(importedTestId, teacherId, { title, category: category === "CAMBRIDGE" ? "CAMBRIDGE" : "GENERAL", durationMinutes });
  return { mockTestId: result.mockTestId, unmatched: result.warnings.reduce((n, w) => n + w.questionNumbers.length, 0), created: true };
}

/** A test that already belongs to another package, or already sits in some Full Mock, can't also become this package's section. */
async function assertSectionIsFree(mockTestId: string, label: string) {
  const test = await prisma.mockTest.findUnique({
    where: { id: mockTestId },
    select: { title: true, packageFullMockTestId: true, fullMockReadingUses: { select: { id: true } }, fullMockListeningUses: { select: { id: true } } },
  });
  if (!test) throw new Error(`The ${label} test could not be found.`);
  if (test.packageFullMockTestId || test.fullMockReadingUses.length > 0 || test.fullMockListeningUses.length > 0) {
    throw new Error(`The ${label} test "${test.title}" already belongs to a Full Mock, so it can't be used in a new package.`);
  }
}

/** Undoes what THIS build created in a failed attempt: the new tests (and their stored audio) go, and each source import goes back to "ready for review" so the teacher can simply try again. */
async function rollbackCreatedTests(teacherId: string, created: { mockTestId: string; importedTestId: string }[]) {
  for (const { mockTestId, importedTestId } of created) {
    const passages = await prisma.passage.findMany({ where: { mockTestId }, select: { audioPath: true, audioUrl: true } }).catch(() => []);
    await prisma.mockTest.deleteMany({ where: { id: mockTestId, createdById: teacherId } }).catch(() => undefined);
    await prisma.importedTest.updateMany({ where: { id: importedTestId, teacherId }, data: { status: "PARSED", resultMockTestId: null } }).catch(() => undefined);
    await deleteStoredFilesIfUnreferenced(passages.flatMap((passage) => [passage.audioPath, passage.audioUrl])).catch(() => undefined);
  }
}

export async function buildFullMockFromImports(teacherId: string, input: QuickBuildInput): Promise<QuickBuildResult> {
  assertOwnListeningAudio(teacherId, input.audio);

  const tasks = input.writingTasks;
  if (tasks.length !== 2 || !tasks.some((t) => t.taskNumber === "TASK_1") || !tasks.some((t) => t.taskNumber === "TASK_2")) {
    throw new Error("Both Writing Task 1 and Task 2 are needed.");
  }
  if (input.readingImportId === input.listeningImportId) throw new Error("The Reading and Listening files must be two different PDFs.");

  // Check BOTH imports before writing anything, so a problem in the second never leaves the first half-built.
  const [reading, listening] = await Promise.all([getImportReadiness(input.readingImportId, teacherId), getImportReadiness(input.listeningImportId, teacherId)]);
  if (reading.type !== "READING") throw new Error("The Reading file isn't a Reading import.");
  if (listening.type !== "LISTENING") throw new Error("The Listening file isn't a Listening import.");
  for (const [label, readiness] of [["Reading", reading], ["Listening", listening]] as const) {
    if (!readiness.ready) throw new Error(`The ${label} PDF isn't ready: ${readiness.issues.slice(0, 2).join(" ")}`);
  }

  // An import that was already confirmed (a retry) must still point at a test that is free to join this package.
  for (const [label, importedTestId] of [["Reading", input.readingImportId], ["Listening", input.listeningImportId]] as const) {
    const row = await prisma.importedTest.findFirst({ where: { id: importedTestId, teacherId }, select: { status: true, resultMockTestId: true } });
    if (row?.status === "IMPORTED" && row.resultMockTestId) await assertSectionIsFree(row.resultMockTestId, label);
  }

  const createdTests: { mockTestId: string; importedTestId: string }[] = [];
  const createdTaskIds: string[] = [];
  let fullMockId: string | null = null;

  try {
    // One after the other (not in parallel) so a failure in the second can't race with the first's rollback.
    const readingImport = await ensureImported(input.readingImportId, teacherId, `${input.title} — Reading`, DEFAULT_READING_MINUTES, input.category);
    if (readingImport.created) createdTests.push({ mockTestId: readingImport.mockTestId, importedTestId: input.readingImportId });
    const listeningImport = await ensureImported(input.listeningImportId, teacherId, `${input.title} — Listening`, DEFAULT_LISTENING_MINUTES, input.category);
    if (listeningImport.created) createdTests.push({ mockTestId: listeningImport.mockTestId, importedTestId: input.listeningImportId });

    const audioSections = await attachListeningAudio(listeningImport.mockTestId, teacherId, input.audio);

    // A Full Mock can only use published Reading/Listening tests (an unpublished one would block the student at attempt time).
    for (const mockTestId of [readingImport.mockTestId, listeningImport.mockTestId]) {
      const test = await prisma.mockTest.findFirst({ where: { id: mockTestId, createdById: teacherId }, select: { isPublished: true } });
      if (test && !test.isPublished) await tm.setPublished(mockTestId, teacherId, true);
    }

    const fullMock = await createFullMockTest(teacherId, {
      title: input.title,
      description: input.description,
      category: input.category,
      difficulty: input.difficulty,
      examNumber: input.examNumber,
      estimatedBandMin: input.estimatedBandMin,
      estimatedBandMax: input.estimatedBandMax,
    });
    fullMockId = fullMock.id;

    await prisma.fullMockReadingSection.create({ data: { fullMockTestId: fullMock.id, mockTestId: readingImport.mockTestId, orderIndex: 0 } });
    await prisma.fullMockListeningSection.create({ data: { fullMockTestId: fullMock.id, mockTestId: listeningImport.mockTestId, orderIndex: 0 } });
    // Listening, Reading and Writing now belong to THIS package: the two tests are stamped with it, so they can't be sat on their own, linked into another mock, or left behind when the mock is deleted.
    await prisma.mockTest.updateMany({
      where: { id: { in: [readingImport.mockTestId, listeningImport.mockTestId] }, createdById: teacherId },
      data: { packageFullMockTestId: fullMock.id },
    });

    for (const [index, task] of [...tasks].sort((a, b) => (a.taskNumber === "TASK_1" ? -1 : b.taskNumber === "TASK_1" ? 1 : 0)).entries()) {
      const created = await createWritingTask(teacherId, {
        title: task.title,
        trainingType: task.trainingType,
        taskNumber: task.taskNumber,
        category: task.category,
        prompt: task.prompt,
        visualDescription: task.visualDescription,
        assignedStudentIds: [],
      });
      createdTaskIds.push(created.id);
      await prisma.fullMockWritingSection.create({ data: { fullMockTestId: fullMock.id, writingTaskId: created.id, orderIndex: index } });
    }

    if (input.publish) await publishFullMockTest(fullMock.id, teacherId);

    const accessCodes =
      input.accessCodes && input.accessCodes.count > 0
        ? (await createBulkMockAccessCodes(fullMock.id, teacherId, { count: input.accessCodes.count, maxRedemptions: input.accessCodes.maxRedemptions })).map((row) => row.code)
        : [];

    // The Writing PDF has done its job (its tasks now live in the mock); no record refers to it, so leaving it would orphan it in storage.
    if (input.writingPdfPath && input.writingPdfPath.startsWith(`${teacherId}/`)) {
      await deleteBucketObjects(TEST_IMPORT_PDF_BUCKET, [input.writingPdfPath]);
    }

    return {
      fullMockTestId: fullMock.id,
      readingMockTestId: readingImport.mockTestId,
      listeningMockTestId: listeningImport.mockTestId,
      status: input.publish ? "PUBLISHED" : "DRAFT",
      readingQuestions: reading.totalQuestions,
      listeningQuestions: listening.totalQuestions,
      writingTasks: tasks.length,
      audioSections,
      unmatchedAnswerCount: readingImport.unmatched + listeningImport.unmatched,
      accessCodes,
    };
  } catch (error) {
    // All or nothing: nothing this call created survives a failure — not the mock, not its writing tasks, not the Reading/Listening tests or the audio attached to them.
    if (fullMockId) await prisma.fullMockTest.delete({ where: { id: fullMockId } }).catch(() => undefined);
    await prisma.writingTask.deleteMany({ where: { id: { in: createdTaskIds }, submissions: { none: {} } } }).catch(() => undefined);
    await rollbackCreatedTests(teacherId, createdTests);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Abandoned uploads
// ---------------------------------------------------------------------------

const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

/**
 * The builder uploads files BEFORE anything is created, so a teacher who picks
 * four files and closes the tab leaves objects in Storage that no record points
 * at. This removes this teacher's recordings and PDFs that nothing references
 * and that are old enough not to be an upload still in progress. Conservative
 * by construction: an object is only deleted when no passage, no PDF import and
 * no library item names it, and never when its age can't be read. Best effort —
 * a failure here never affects the page that triggered it.
 */
export async function sweepStaleUploads(teacherId: string, options: { olderThanMs?: number; dryRun?: boolean } = {}): Promise<{ removed: number; candidates: string[] }> {
  const cutoff = Date.now() - (options.olderThanMs ?? STALE_UPLOAD_MS);
  let removed = 0;
  let candidates: string[] = [];

  try {
    const [audioObjects, pdfObjects] = await Promise.all([listBucketFolder(LISTENING_AUDIO_BUCKET, teacherId), listBucketFolder(TEST_IMPORT_PDF_BUCKET, teacherId)]);

    const [passages, imports] = await Promise.all([
      prisma.passage.findMany({ where: { mockTest: { createdById: teacherId }, OR: [{ audioPath: { not: null } }, { audioUrl: { not: null } }] }, select: { audioPath: true, audioUrl: true } }),
      prisma.importedTest.findMany({ where: { teacherId }, select: { pdfPath: true } }),
    ]);
    const usedAudio = new Set(passages.flatMap((p) => [p.audioPath, p.audioUrl]).map((ref) => parseStoredFileLocation(ref)?.path).filter(Boolean));
    const usedPdfs = new Set(imports.map((row) => row.pdfPath));

    const stale = (info: { createdAt: Date | null }) => info.createdAt != null && info.createdAt.getTime() < cutoff;
    const audioToRemove = audioObjects.filter((o) => stale(o) && !usedAudio.has(`${teacherId}/${o.name}`)).map((o) => `${teacherId}/${o.name}`);
    const pdfsToRemove = pdfObjects.filter((o) => stale(o) && !usedPdfs.has(`${teacherId}/${o.name}`)).map((o) => `${teacherId}/${o.name}`);

    candidates = [...audioToRemove.map((path) => `${LISTENING_AUDIO_BUCKET}/${path}`), ...pdfsToRemove.map((path) => `${TEST_IMPORT_PDF_BUCKET}/${path}`)];
    if (!options.dryRun) {
      const [a, p] = await Promise.all([deleteBucketObjects(LISTENING_AUDIO_BUCKET, audioToRemove), deleteBucketObjects(TEST_IMPORT_PDF_BUCKET, pdfsToRemove)]);
      removed = a.removed + p.removed;
    }
  } catch {
    // Storage listing unavailable — nothing to sweep this time.
  }
  return { removed, candidates };
}
