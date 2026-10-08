import "server-only";
import { authorScope } from "@/lib/exam/test-access";
import type { MockTestCategory, MockTestDifficulty, WritingTaskCategory, WritingTaskNumber } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getQuestionNumberCounts } from "@/lib/exam/question-counts";
import { versionNumbersFor } from "@/lib/exam/version-numbers";
import { FULL_IELTS_ONLY, isCustomFormat } from "@/lib/exam/test-format";
import { collectTestDependencies, deleteStoredFilesIfUnreferenced } from "@/lib/exam/test-management";
import { deleteBucketObjects } from "@/lib/uploads/storage-cleanup";
import { TEST_IMPORT_PDF_BUCKET } from "@/lib/uploads/bucket-names";
import { createWritingTask, setWritingTaskImage, setWritingTaskStatus } from "@/lib/writing-tasks";
import { createSpeakingTask, setSpeakingTaskStatus } from "@/lib/speaking";
import {
  FULL_MOCK_LISTENING_MINUTES,
  FULL_MOCK_LISTENING_TRANSFER_MINUTES,
  FULL_MOCK_READING_MINUTES,
  FULL_MOCK_SPEAKING_MINUTES,
  FULL_MOCK_WRITING_MINUTES,
} from "@/lib/full-mock-constants";

// ---------------------------------------------------------------------------
// Phase 34 — Full Mock Test builder (teacher side). See prisma/schema.prisma
// for the FullMockTest / FullMock*Section relational design: every section
// is a thin junction row pointing at real content (an existing MockTest for
// Reading/Listening, a WritingTask/SpeakingTask authored here for
// Writing/Speaking) — nothing is ever duplicated.
// ---------------------------------------------------------------------------

async function assertOwnsFullMockTest(id: string, teacherId: string) {
  // Phase L1 - a Root Teacher manages every Full Mock; a teacher their own (see test-access).
  const test = await prisma.fullMockTest.findFirst({ where: { id, ...(await authorScope(teacherId)) } });
  if (!test) throw new Error("Full mock test not found.");
  return test;
}

// ---------------------------------------------------------------------------
// Step 1 — Basic Information
// ---------------------------------------------------------------------------

export type FullMockBasicsInput = {
  title: string;
  description?: string;
  coverImagePath?: string;
  estimatedBandMin?: number;
  estimatedBandMax?: number;
  examNumber?: number;
  difficulty?: MockTestDifficulty;
  category?: MockTestCategory;
};

export async function createFullMockTest(teacherId: string, input: FullMockBasicsInput) {
  return prisma.fullMockTest.create({
    data: {
      title: input.title,
      description: input.description || null,
      coverImagePath: input.coverImagePath || null,
      estimatedBandMin: input.estimatedBandMin ?? null,
      estimatedBandMax: input.estimatedBandMax ?? null,
      examNumber: input.examNumber ?? null,
      difficulty: input.difficulty ?? null,
      category: input.category ?? "GENERAL",
      createdById: teacherId,
    },
  });
}

export async function updateFullMockTestBasics(id: string, teacherId: string, input: FullMockBasicsInput): Promise<void> {
  await assertOwnsFullMockTest(id, teacherId);
  await prisma.fullMockTest.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description || null,
      coverImagePath: input.coverImagePath || null,
      estimatedBandMin: input.estimatedBandMin ?? null,
      estimatedBandMax: input.estimatedBandMax ?? null,
      examNumber: input.examNumber ?? null,
      difficulty: input.difficulty ?? null,
      category: input.category ?? "GENERAL",
    },
  });
}

export type FullMockDeletionImpact = {
  attempts: number;
  accessCodes: number;
  /** Reading / Listening tests built for this mock (deleted with it). Tests merely linked in from elsewhere are not listed — they're kept. */
  ownedTests: { id: string; title: string; type: string }[];
  writingTasks: number;
  speakingTasks: number;
};

/** What deleting this Full Mock would take with it — shown in the confirmation dialog and checked by deleteFullMockTest itself. */
export async function getFullMockDeletionImpact(id: string, teacherId: string): Promise<FullMockDeletionImpact> {
  await assertOwnsFullMockTest(id, teacherId);
  const [attempts, accessCodes, ownedTests, writingTasks, speakingTasks] = await Promise.all([
    prisma.fullMockAttempt.count({ where: { fullMockTestId: id } }),
    prisma.mockAccessCode.count({ where: { fullMockTestId: id } }),
    prisma.mockTest.findMany({ where: { packageFullMockTestId: id }, select: { id: true, title: true, type: true } }),
    prisma.fullMockWritingSection.count({ where: { fullMockTestId: id } }),
    prisma.fullMockSpeakingSection.count({ where: { fullMockTestId: id } }),
  ]);
  return { attempts, accessCodes, ownedTests, writingTasks, speakingTasks };
}

export type DeleteFullMockOutcome = { deletedAttempts: number; deletedTests: number; removedFiles: number; failedFiles: string[] };

/**
 * Phase B — deletes a Full Mock together with EVERYTHING that exists only
 * because of it, in one database transaction so it is all-or-nothing:
 *  - the mock, its section links, access codes + redemptions, attempts and
 *    their section results (cascade);
 *  - the Reading / Listening tests built for it (package-owned), with their
 *    passages, questions, answer key and students' results — and the PDF
 *    import records they came from;
 *  - its Writing and Speaking tasks (they belong to exactly one mock), the
 *    students' submissions against them, and the Media Library usage rows.
 * Afterwards the uploaded files go too: the listening recording, attachment
 * images, covers, and the source PDFs.
 * A mock students have already sat is only deleted when the caller confirms
 * that their attempts and scores go with it (`deleteAttempts`).
 */
export async function deleteFullMockTest(id: string, teacherId: string, options: { deleteAttempts?: boolean } = {}): Promise<DeleteFullMockOutcome> {
  const mock = await assertOwnsFullMockTest(id, teacherId);
  const impact = await getFullMockDeletionImpact(id, teacherId);

  if (impact.attempts > 0 && !options.deleteAttempts) {
    throw new Error(`This full mock has ${impact.attempts} student attempt${impact.attempts === 1 ? "" : "s"} and cannot be deleted. Archive it instead: its attempts and scores stay.`);
  }

  const ownedTestIds = impact.ownedTests.map((test) => test.id);
  const [writingSections, speakingSections, deps] = await Promise.all([
    prisma.fullMockWritingSection.findMany({ where: { fullMockTestId: id }, select: { writingTaskId: true, writingTask: { select: { coverImagePath: true } } } }),
    prisma.fullMockSpeakingSection.findMany({ where: { fullMockTestId: id }, select: { speakingTaskId: true, speakingTask: { select: { coverImagePath: true } } } }),
    collectTestDependencies(ownedTestIds),
  ]);
  const writingTaskIds = writingSections.map((section) => section.writingTaskId);
  const speakingTaskIds = speakingSections.map((section) => section.speakingTaskId);

  await prisma.$transaction([
    prisma.mediaUsage.deleteMany({ where: { context: "PASSAGE_ATTACHMENT", referenceId: { in: deps.attachmentIds } } }),
    prisma.mediaUsage.deleteMany({ where: { context: "WRITING_TASK_VISUAL", referenceId: { in: writingTaskIds } } }),
    prisma.importedTest.deleteMany({ where: { id: { in: deps.importIds } } }),
    // Students' work on this mock's own tasks exists only because of the mock (a task belongs to exactly one mock).
    prisma.writingSubmission.deleteMany({ where: { taskId: { in: writingTaskIds } } }),
    prisma.speakingSubmission.deleteMany({ where: { taskId: { in: speakingTaskIds } } }),
    // The owned tests go BEFORE the mock row so their package link never has to be nulled out and left behind as a visible standalone test.
    prisma.mockTest.deleteMany({ where: { packageFullMockTestId: id } }),
    prisma.fullMockTest.delete({ where: { id } }),
    prisma.writingTask.deleteMany({ where: { id: { in: writingTaskIds } } }),
    prisma.speakingTask.deleteMany({ where: { id: { in: speakingTaskIds } } }),
  ]);

  const [files, pdfs] = await Promise.all([
    deleteStoredFilesIfUnreferenced([
      mock.coverImagePath,
      ...deps.fileRefs,
      ...writingSections.map((section) => section.writingTask.coverImagePath),
      ...speakingSections.map((section) => section.speakingTask.coverImagePath),
    ]),
    deleteBucketObjects(TEST_IMPORT_PDF_BUCKET, deps.importPdfPaths),
  ]);

  return { deletedAttempts: impact.attempts, deletedTests: ownedTestIds.length, removedFiles: files.removed + pdfs.removed, failedFiles: [...files.failed, ...pdfs.failed] };
}

/** Phase 47 — completes the DRAFT/PUBLISHED/ARCHIVED lifecycle the enum already declared; archiving a published test keeps its real attempts/results intact but pulls it out of the student-facing listing (getPublishedFullMockTests only ever selects status: "PUBLISHED"). */
export async function archiveFullMockTest(id: string, teacherId: string): Promise<void> {
  await assertOwnsFullMockTest(id, teacherId);
  await prisma.fullMockTest.update({ where: { id }, data: { status: "ARCHIVED" } });
}

export async function unarchiveFullMockTest(id: string, teacherId: string): Promise<void> {
  await assertOwnsFullMockTest(id, teacherId);
  await prisma.fullMockTest.update({ where: { id }, data: { status: "DRAFT" } });
}

/**
 * Phase 47 — real duplication, not a shortcut: Reading/Listening sections
 * are safe to re-link as-is (FullMockReadingSection/FullMockListeningSection
 * are only unique per (fullMockTestId, mockTestId), so many Full Mock Tests
 * can already point at the same underlying test). Writing/Speaking sections
 * CANNOT be re-linked — writingTaskId/speakingTaskId are globally unique
 * (one WritingTask/SpeakingTask belongs to exactly one Full Mock Test ever)
 * — so those are real content clones via the same createWritingTask/
 * createSpeakingTask helpers the builder itself uses, never a shared
 * reference. The clone always starts DRAFT regardless of the source's
 * status, so an incomplete/mis-copied duplicate can never be accidentally
 * live for students.
 */
export async function duplicateFullMockTest(id: string, teacherId: string) {
  const source = await getFullMockTestForEdit(id, teacherId);
  if (!source) throw new Error("Full mock test not found.");
  if ([...source.readingSections, ...source.listeningSections].some((section) => section.mockTest.packageFullMockTestId)) {
    throw new Error("This mock owns its Listening and Reading tests (it was built from files), so it can't be duplicated. Build a new one from the files instead.");
  }

  const clone = await prisma.fullMockTest.create({
    data: {
      title: `${source.title} (Copy)`,
      description: source.description,
      coverImagePath: source.coverImagePath,
      estimatedBandMin: source.estimatedBandMin,
      estimatedBandMax: source.estimatedBandMax,
      difficulty: source.difficulty,
      category: source.category,
      createdById: teacherId,
      status: "DRAFT",
    },
  });

  for (const [index, section] of source.readingSections.entries()) {
    await prisma.fullMockReadingSection.create({
      data: { fullMockTestId: clone.id, mockTestId: section.mockTest.id, orderIndex: index },
    });
  }
  for (const [index, section] of source.listeningSections.entries()) {
    await prisma.fullMockListeningSection.create({
      data: { fullMockTestId: clone.id, mockTestId: section.mockTest.id, orderIndex: index },
    });
  }
  for (const [index, section] of source.writingSections.entries()) {
    const task = await createWritingTask(teacherId, {
      title: section.writingTask.title,
      trainingType: section.writingTask.trainingType,
      taskNumber: section.writingTask.taskNumber,
      category: section.writingTask.category,
      prompt: section.writingTask.prompt,
      visualDescription: section.writingTask.visualDescription ?? undefined,
      imageMediaFileId: section.writingTask.imageMediaFileId ?? undefined,
      targetBand: section.writingTask.targetBand ?? undefined,
      assignedStudentIds: [],
    });
    await prisma.fullMockWritingSection.create({ data: { fullMockTestId: clone.id, writingTaskId: task.id, orderIndex: index } });
  }
  for (const [index, section] of source.speakingSections.entries()) {
    const task = await createSpeakingTask(teacherId, {
      title: section.speakingTask.title,
      part: section.speakingTask.part,
      prompt: section.speakingTask.prompt,
    });
    await prisma.fullMockSpeakingSection.create({ data: { fullMockTestId: clone.id, speakingTaskId: task.id, orderIndex: index } });
  }

  return clone;
}

// ---------------------------------------------------------------------------
// Step 2 / 3 — Reading & Listening sections (reuse an existing, published
// Reading/Listening test authored by this teacher; one per skill, matching
// the real IELTS exam's single Reading module + single Listening module).
// Only PUBLISHED, non-archived tests are offered — an unpublished underlying
// test would silently block students at attempt time (getOrCreateAttempt
// requires isPublished).
// ---------------------------------------------------------------------------

export type PickableMockTest = {
  id: string;
  title: string;
  durationMinutes: number | null;
  questionCount: number;
  /** Phase L2 - versions share a title, so the picker tells them apart as v1, v2 ... (null for a test that is not part of a version chain). */
  versionNumber: number | null;
};

export async function listPickableTestsForFullMock(
  teacherId: string,
  type: "READING" | "LISTENING"
): Promise<PickableMockTest[]> {
  const tests = await prisma.mockTest.findMany({
    // A test that belongs to another Full Mock package isn't offered here — it can only ever be part of its own package.
    // Phase Q - only a Full IELTS test (40 questions) can be part of a Full Mock: a Custom test is never offered.
    where: { ...(await authorScope(teacherId)), type, isPublished: true, isArchived: false, packageFullMockTestId: null, AND: [FULL_IELTS_ONLY] },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, durationMinutes: true, versionOfId: true, _count: { select: { versions: true } } },
  });
  const [counts, numbers] = await Promise.all([
    getQuestionNumberCounts(tests.map((t) => t.id)),
    versionNumbersFor(tests.filter((t) => t.versionOfId || t._count.versions > 0).map((t) => t.id)),
  ]);
  return tests.map((t) => ({ id: t.id, title: t.title, durationMinutes: t.durationMinutes, questionCount: counts.get(t.id) ?? 0, versionNumber: numbers.get(t.id) ?? null }));
}

async function setFullMockSkillTest(
  fullMockTestId: string,
  teacherId: string,
  skill: "READING" | "LISTENING",
  mockTestId: string | null
): Promise<void> {
  await assertOwnsFullMockTest(fullMockTestId, teacherId);

  if (mockTestId) {
    const test = await prisma.mockTest.findFirst({
      where: { id: mockTestId, ...(await authorScope(teacherId)), type: skill, isPublished: true, isArchived: false },
    });
    if (!test) throw new Error(`That ${skill.toLowerCase()} test isn't available.`);
    if (isCustomFormat(test.testFormat)) throw new Error(`"${test.title}" is a Custom test (any number of questions): a Full Mock needs a Full IELTS test of exactly 40 questions.`);
    if (test.packageFullMockTestId && test.packageFullMockTestId !== fullMockTestId) {
      throw new Error(`That ${skill.toLowerCase()} test belongs to another Full Mock package and can't be used here.`);
    }
  }

  if (skill === "READING") {
    await prisma.$transaction([
      prisma.fullMockReadingSection.deleteMany({ where: { fullMockTestId } }),
      ...(mockTestId ? [prisma.fullMockReadingSection.create({ data: { fullMockTestId, mockTestId, orderIndex: 0 } })] : []),
    ]);
  } else {
    await prisma.$transaction([
      prisma.fullMockListeningSection.deleteMany({ where: { fullMockTestId } }),
      ...(mockTestId ? [prisma.fullMockListeningSection.create({ data: { fullMockTestId, mockTestId, orderIndex: 0 } })] : []),
    ]);
  }
}

export async function setFullMockReadingTest(fullMockTestId: string, teacherId: string, mockTestId: string | null): Promise<void> {
  await setFullMockSkillTest(fullMockTestId, teacherId, "READING", mockTestId);
}

export async function setFullMockListeningTest(fullMockTestId: string, teacherId: string, mockTestId: string | null): Promise<void> {
  await setFullMockSkillTest(fullMockTestId, teacherId, "LISTENING", mockTestId);
}

// ---------------------------------------------------------------------------
// Step 4 — Writing section (Task 1 + Task 2, authored inline). Content edits
// go straight through prisma on purpose, bypassing updateWritingTask's
// student-assignment sync — a Full Mock writing task is never assigned via
// the general roster; real per-student WritingTaskAssignment rows are
// created individually at attempt time (see full-mock-attempts.ts) and must
// never be wiped out by a later prompt edit here.
// ---------------------------------------------------------------------------

export type FullMockWritingTaskInput = {
  sectionId?: string;
  taskNumber: WritingTaskNumber;
  category: WritingTaskCategory;
  title: string;
  prompt: string;
  visualDescription?: string;
  /** Phase F - the Task 1 picture (a Media Library file id), null to remove it, undefined to leave it as it is. */
  imageMediaFileId?: string | null;
};

export async function saveFullMockWritingTask(fullMockTestId: string, teacherId: string, input: FullMockWritingTaskInput): Promise<void> {
  await assertOwnsFullMockTest(fullMockTestId, teacherId);

  if (input.sectionId) {
    const section = await prisma.fullMockWritingSection.findFirst({
      where: { id: input.sectionId, fullMockTestId },
      select: { writingTaskId: true },
    });
    if (!section) throw new Error("Writing section not found.");
    await prisma.writingTask.update({
      where: { id: section.writingTaskId },
      data: {
        title: input.title,
        taskNumber: input.taskNumber,
        category: input.category,
        prompt: input.prompt,
        visualDescription: input.visualDescription || null,
      },
    });
    if (input.imageMediaFileId !== undefined) await setWritingTaskImage(section.writingTaskId, teacherId, input.imageMediaFileId);
    return;
  }

  const task = await createWritingTask(teacherId, {
    title: input.title,
    trainingType: "ACADEMIC",
    taskNumber: input.taskNumber,
    category: input.category,
    prompt: input.prompt,
    visualDescription: input.visualDescription,
    imageMediaFileId: input.imageMediaFileId ?? undefined,
    assignedStudentIds: [],
  });

  const existingCount = await prisma.fullMockWritingSection.count({ where: { fullMockTestId } });
  await prisma.fullMockWritingSection.create({
    data: { fullMockTestId, writingTaskId: task.id, orderIndex: existingCount },
  });
}

export async function deleteFullMockWritingTask(fullMockTestId: string, teacherId: string, sectionId: string): Promise<void> {
  await assertOwnsFullMockTest(fullMockTestId, teacherId);
  const section = await prisma.fullMockWritingSection.findFirst({ where: { id: sectionId, fullMockTestId } });
  if (!section) throw new Error("Writing section not found.");

  const submissionCount = await prisma.writingSubmission.count({ where: { taskId: section.writingTaskId } });
  await prisma.fullMockWritingSection.delete({ where: { id: sectionId } });
  if (submissionCount === 0) {
    await prisma.writingTask.delete({ where: { id: section.writingTaskId } }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Step 5 — Speaking section (Part 1 questions, Part 2 cue card, Part 3
// questions — each its own SpeakingTask + junction row, same reasoning as
// Writing above for why edits bypass any assignment logic).
// ---------------------------------------------------------------------------

export type FullMockSpeakingTaskInput = {
  sectionId?: string;
  part: 1 | 2 | 3;
  title: string;
  prompt: string;
};

export async function saveFullMockSpeakingTask(fullMockTestId: string, teacherId: string, input: FullMockSpeakingTaskInput): Promise<void> {
  await assertOwnsFullMockTest(fullMockTestId, teacherId);

  if (input.sectionId) {
    const section = await prisma.fullMockSpeakingSection.findFirst({
      where: { id: input.sectionId, fullMockTestId },
      select: { speakingTaskId: true },
    });
    if (!section) throw new Error("Speaking section not found.");
    await prisma.speakingTask.update({
      where: { id: section.speakingTaskId },
      data: { title: input.title, part: input.part, prompt: input.prompt },
    });
    return;
  }

  const task = await createSpeakingTask(teacherId, { title: input.title, part: input.part, prompt: input.prompt });
  const existingCount = await prisma.fullMockSpeakingSection.count({ where: { fullMockTestId } });
  await prisma.fullMockSpeakingSection.create({
    data: { fullMockTestId, speakingTaskId: task.id, orderIndex: existingCount },
  });
}

export async function deleteFullMockSpeakingTask(fullMockTestId: string, teacherId: string, sectionId: string): Promise<void> {
  await assertOwnsFullMockTest(fullMockTestId, teacherId);
  const section = await prisma.fullMockSpeakingSection.findFirst({ where: { id: sectionId, fullMockTestId } });
  if (!section) throw new Error("Speaking section not found.");

  const submissionCount = await prisma.speakingSubmission.count({ where: { taskId: section.speakingTaskId } });
  await prisma.fullMockSpeakingSection.delete({ where: { id: sectionId } });
  if (submissionCount === 0) {
    await prisma.speakingTask.delete({ where: { id: section.speakingTaskId } }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Step 6 — Review & Publish
// ---------------------------------------------------------------------------

export type FullMockCompleteness = {
  hasReading: boolean;
  hasListening: boolean;
  hasTask1: boolean;
  hasTask2: boolean;
  hasPart1: boolean;
  hasPart2: boolean;
  hasPart3: boolean;
  /** Phase B — every Listening section has its recording (a Listening mock without audio is silent for the student). True when the mock has no Listening section yet (that's reported by hasListening). */
  listeningAudioReady: boolean;
  /** Phase B — titles of linked tests that belong to a DIFFERENT Full Mock package. Listening, Reading and Writing of one mock must all come from the same package. */
  foreignPackageTests: string[];
  /** Phase B — titles of linked Reading/Listening tests that are not published (a student could not start them). */
  unpublishedTests: string[];
  /** Phase Q - titles of linked tests that are Custom tests (any number of questions): a Full Mock only takes Full IELTS tests. */
  customTests: string[];
  /** Phase A — Speaking is optional (a Listening + Reading + Writing mock is a valid Full Mock). When ANY speaking task exists the mock must have all three parts, so a half-built Speaking section can't go live. */
  hasSpeaking: boolean;
  isComplete: boolean;
};

type SectionTestInfo = {
  mockTest: { title: string; isPublished: boolean; testFormat?: string | null; packageFullMockTestId: string | null; passages: { audioPath: string | null; audioUrl: string | null }[] };
};

function computeCompleteness(test: {
  id: string;
  readingSections: SectionTestInfo[];
  listeningSections: SectionTestInfo[];
  writingSections: { writingTask: { taskNumber: WritingTaskNumber } }[];
  speakingSections: { speakingTask: { part: number } }[];
}): FullMockCompleteness {
  const hasReading = test.readingSections.length > 0;
  const hasListening = test.listeningSections.length > 0;
  const hasTask1 = test.writingSections.some((s) => s.writingTask.taskNumber === "TASK_1");
  const hasTask2 = test.writingSections.some((s) => s.writingTask.taskNumber === "TASK_2");
  const hasPart1 = test.speakingSections.some((s) => s.speakingTask.part === 1);
  const hasPart2 = test.speakingSections.some((s) => s.speakingTask.part === 2);
  const hasPart3 = test.speakingSections.some((s) => s.speakingTask.part === 3);

  const hasSpeaking = test.speakingSections.length > 0;
  const speakingOk = !hasSpeaking || (hasPart1 && hasPart2 && hasPart3);

  const listeningAudioReady = test.listeningSections.every(
    (section) => section.mockTest.passages.length > 0 && section.mockTest.passages.every((passage) => Boolean(passage.audioPath || passage.audioUrl))
  );
  const linked = [...test.readingSections, ...test.listeningSections];
  const foreignPackageTests = linked.filter((s) => s.mockTest.packageFullMockTestId && s.mockTest.packageFullMockTestId !== test.id).map((s) => s.mockTest.title);
  const unpublishedTests = linked.filter((s) => !s.mockTest.isPublished).map((s) => s.mockTest.title);
  const customTests = linked.filter((s) => isCustomFormat(s.mockTest.testFormat)).map((s) => s.mockTest.title);

  return {
    hasReading,
    hasListening,
    hasTask1,
    hasTask2,
    hasPart1,
    hasPart2,
    hasPart3,
    hasSpeaking,
    listeningAudioReady,
    foreignPackageTests,
    unpublishedTests,
    customTests,
    isComplete:
      hasReading && hasListening && hasTask1 && hasTask2 && speakingOk && listeningAudioReady && foreignPackageTests.length === 0 && unpublishedTests.length === 0 && customTests.length === 0,
  };
}

/** The other Full Mocks that are active right now (published) and that this teacher manages: what publishing another one would archive. */
export type ActiveFullMock = { id: string; title: string; attempts: number; inProgress: number };

/**
 * Phase O - "Only one Full Mock is active at a time; old ones are archived". Publishing a Full Mock archives the other published Full Mock(s) of the teacher (a Root Teacher:
 * of everybody - the one platform-wide Full Mock). It is asked about first: this error carries the list so the screen can say which mock(s) go and how many students are in
 * the middle of them (they can finish: an archived mock still lets a sitting that is under way continue). The attempts of an archived mock are never touched.
 */
export class OtherActiveMockError extends Error {
  constructor(readonly others: ActiveFullMock[]) {
    super(`Only one Full Mock is active at a time. Publishing this one will archive: ${others.map((other) => `"${other.title}"`).join(", ")}.`);
    this.name = "OtherActiveMockError";
  }
}

export async function listOtherActiveFullMocks(id: string, teacherId: string): Promise<ActiveFullMock[]> {
  const others = await prisma.fullMockTest.findMany({
    where: { status: "PUBLISHED", id: { not: id }, ...(await authorScope(teacherId)) },
    select: { id: true, title: true, _count: { select: { attempts: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (others.length === 0) return [];
  const inProgress = await prisma.fullMockAttempt.groupBy({ by: ["fullMockTestId"], where: { fullMockTestId: { in: others.map((other) => other.id) }, status: "IN_PROGRESS" }, _count: { _all: true } });
  const open = new Map(inProgress.map((row) => [row.fullMockTestId, row._count._all]));
  return others.map((other) => ({ id: other.id, title: other.title, attempts: other._count.attempts, inProgress: open.get(other.id) ?? 0 }));
}

export async function publishFullMockTest(id: string, teacherId: string, options: { archiveOthers?: boolean } = {}): Promise<{ archived: string[] }> {
  const test = await getFullMockTestForEdit(id, teacherId);
  if (!test) throw new Error("Full mock test not found.");

  const completeness = computeCompleteness(test);
  if (!completeness.isComplete) {
    const missing: string[] = [];
    if (!completeness.hasListening) missing.push("a Listening test");
    if (!completeness.hasReading) missing.push("a Reading test");
    if (!completeness.hasTask1 || !completeness.hasTask2) missing.push("Writing Task 1 and Task 2");
    if (completeness.hasSpeaking && !(completeness.hasPart1 && completeness.hasPart2 && completeness.hasPart3)) missing.push("all three Speaking parts");
    if (completeness.hasListening && !completeness.listeningAudioReady) missing.push("the Listening audio on every part");
    if (completeness.foreignPackageTests.length > 0) missing.push(`tests from this mock's own package (${completeness.foreignPackageTests.join(", ")} belongs to another mock)`);
    if (completeness.unpublishedTests.length > 0) missing.push(`published Reading/Listening tests (${completeness.unpublishedTests.join(", ")} isn't published)`);
    if (completeness.customTests.length > 0) missing.push(`Full IELTS tests of 40 questions (${completeness.customTests.join(", ")} is a Custom test)`);
    throw new Error(`This mock can't be published yet — it still needs ${missing.join("; ")}.`);
  }

  await Promise.all([
    ...test.writingSections
      .filter((s) => s.writingTask.status === "DRAFT")
      .map((s) => setWritingTaskStatus(s.writingTaskId, teacherId, "PUBLISHED")),
    ...test.speakingSections
      .filter((s) => s.speakingTask.status === "DRAFT")
      .map((s) => setSpeakingTaskStatus(s.speakingTaskId, teacherId, "PUBLISHED")),
  ]);

  const others = await listOtherActiveFullMocks(id, teacherId);
  if (others.length > 0 && !options.archiveOthers) throw new OtherActiveMockError(others);

  await prisma.$transaction([
    ...(others.length > 0 ? [prisma.fullMockTest.updateMany({ where: { id: { in: others.map((other) => other.id) }, status: "PUBLISHED" }, data: { status: "ARCHIVED" } })] : []),
    prisma.fullMockTest.update({ where: { id }, data: { status: "PUBLISHED" } }),
  ]);
  return { archived: others.map((other) => other.id) };
}

export async function unpublishFullMockTest(id: string, teacherId: string): Promise<void> {
  await assertOwnsFullMockTest(id, teacherId);
  await prisma.fullMockTest.update({ where: { id }, data: { status: "DRAFT" } });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getFullMockTestForEdit(id: string, teacherId: string) {
  return prisma.fullMockTest.findFirst({
    where: { id, ...(await authorScope(teacherId)) },
    include: {
      readingSections: {
        orderBy: { orderIndex: "asc" },
        include: { mockTest: { select: {
            id: true,
            title: true,
            durationMinutes: true,
            isPublished: true,
            testFormat: true,
            packageFullMockTestId: true,
            passages: { select: { audioPath: true, audioUrl: true } },
            _count: { select: { questions: true } },
          }, } },
      },
      listeningSections: {
        orderBy: { orderIndex: "asc" },
        include: { mockTest: { select: {
            id: true,
            title: true,
            durationMinutes: true,
            isPublished: true,
            testFormat: true,
            packageFullMockTestId: true,
            passages: { select: { audioPath: true, audioUrl: true } },
            _count: { select: { questions: true } },
          }, } },
      },
      writingSections: {
        orderBy: { orderIndex: "asc" },
        include: { writingTask: { include: { imageMediaFile: { select: { id: true, path: true, mimeType: true, width: true, height: true, size: true, fileName: true } } } } },
      },
      speakingSections: { orderBy: { orderIndex: "asc" }, include: { speakingTask: true } },
      _count: { select: { attempts: true } },
    },
  });
}

export type FullMockTestForEdit = NonNullable<Awaited<ReturnType<typeof getFullMockTestForEdit>>>;

export function getFullMockCompleteness(test: FullMockTestForEdit): FullMockCompleteness {
  return computeCompleteness(test);
}

export async function listFullMockTestsForTeacher(teacherId: string) {
  const tests = await prisma.fullMockTest.findMany({
    where: await authorScope(teacherId),
    orderBy: { createdAt: "desc" },
    include: {
      readingSections: { select: { id: true } },
      listeningSections: { select: { id: true } },
      writingSections: { select: { id: true } },
      speakingSections: { select: { id: true } },
      createdBy: { select: { user: { select: { name: true, email: true } } } },
      _count: { select: { attempts: true, packageTests: true } },
    },
  });

  return tests.map((test) => ({
    id: test.id,
    title: test.title,
    status: test.status,
    createdById: test.createdById,
    authorName: test.createdBy.user.name ?? test.createdBy.user.email,
    createdAt: test.createdAt,
    attemptCount: test._count.attempts,
    packageTestCount: test._count.packageTests,
    examNumber: test.examNumber,
    difficulty: test.difficulty,
    category: test.category,
    sectionsFilled:
      (test.readingSections.length > 0 ? 1 : 0) +
      (test.listeningSections.length > 0 ? 1 : 0) +
      (test.writingSections.length > 0 ? 1 : 0) +
      (test.speakingSections.length > 0 ? 1 : 0),
  }));
}

/**
 * A single published Full Mock Test's detail, for the student's pre-start confirmation page. Phase O: a Full Mock that was archived since the student began their sitting is
 * still returned to THAT student (their sitting under way can be finished); to nobody else.
 */
export async function getPublishedFullMockTestDetail(id: string, studentId?: string) {
  const test = await prisma.fullMockTest.findFirst({
    where: { id, OR: [{ status: "PUBLISHED" }, ...(studentId ? [{ status: "ARCHIVED" as const, attempts: { some: { studentId, status: "IN_PROGRESS" as const } } }] : [])] },
    include: {
      readingSections: { include: { mockTest: { select: { id: true, title: true, durationMinutes: true } } } },
      listeningSections: { include: { mockTest: { select: { id: true, title: true, durationMinutes: true } } } },
      writingSections: { select: { id: true } },
      speakingSections: { select: { id: true } },
    },
  });
  if (!test) return null;

  // Inside a Full Mock every section runs on the real IELTS clock, whatever length the standalone paper was saved with.
  const readingMinutes = test.readingSections.length > 0 ? FULL_MOCK_READING_MINUTES : 0;
  const listeningMinutes = test.listeningSections.length > 0 ? FULL_MOCK_LISTENING_MINUTES + FULL_MOCK_LISTENING_TRANSFER_MINUTES : 0;
  // Numbered questions (a matching / summary row covers several), not database rows — see getQuestionNumberCounts.
  const questionCounts = await getQuestionNumberCounts([...test.readingSections, ...test.listeningSections].map((s) => s.mockTest.id));
  const readingQuestionCount = test.readingSections.reduce((sum, s) => sum + (questionCounts.get(s.mockTest.id) ?? 0), 0);
  const listeningQuestionCount = test.listeningSections.reduce((sum, s) => sum + (questionCounts.get(s.mockTest.id) ?? 0), 0);

  return {
    id: test.id,
    title: test.title,
    description: test.description,
    examNumber: test.examNumber,
    difficulty: test.difficulty,
    category: test.category,
    estimatedBandMin: test.estimatedBandMin,
    estimatedBandMax: test.estimatedBandMax,
    totalDurationMinutes:
      readingMinutes + listeningMinutes + (test.writingSections.length > 0 ? FULL_MOCK_WRITING_MINUTES : 0) + (test.speakingSections.length > 0 ? FULL_MOCK_SPEAKING_MINUTES : 0),
    /** Phase 40 — Part 11's "Number of Questions" on the instructions screen. Reading/Listening only — Writing/Speaking are open-response, not question-counted. */
    totalQuestionCount: readingQuestionCount + listeningQuestionCount,
    /** Phase A — a mock may omit Writing and/or Speaking; the start screen lists only what the student will actually sit. */
    includes: { writing: test.writingSections.length > 0, speaking: test.speakingSections.length > 0 },
  };
}
