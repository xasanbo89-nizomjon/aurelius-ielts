import "server-only";
import type { MockTestCategory, MockTestDifficulty, WritingTaskCategory, WritingTaskNumber } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createWritingTask, setWritingTaskStatus } from "@/lib/writing-tasks";
import { createSpeakingTask, setSpeakingTaskStatus } from "@/lib/speaking";
import { FULL_MOCK_SPEAKING_MINUTES, FULL_MOCK_WRITING_MINUTES } from "@/lib/full-mock-constants";

// ---------------------------------------------------------------------------
// Phase 34 — Full Mock Test builder (teacher side). See prisma/schema.prisma
// for the FullMockTest / FullMock*Section relational design: every section
// is a thin junction row pointing at real content (an existing MockTest for
// Reading/Listening, a WritingTask/SpeakingTask authored here for
// Writing/Speaking) — nothing is ever duplicated.
// ---------------------------------------------------------------------------

async function assertOwnsFullMockTest(id: string, teacherId: string) {
  const test = await prisma.fullMockTest.findFirst({ where: { id, createdById: teacherId } });
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

export async function deleteFullMockTest(id: string, teacherId: string): Promise<void> {
  await assertOwnsFullMockTest(id, teacherId);
  const attemptCount = await prisma.fullMockAttempt.count({ where: { fullMockTestId: id } });
  if (attemptCount > 0) {
    throw new Error("This full mock test has real student attempts and can't be deleted — archive it instead.");
  }
  await prisma.fullMockTest.delete({ where: { id } });
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
};

export async function listPickableTestsForFullMock(
  teacherId: string,
  type: "READING" | "LISTENING"
): Promise<PickableMockTest[]> {
  const tests = await prisma.mockTest.findMany({
    where: { createdById: teacherId, type, isPublished: true, isArchived: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, durationMinutes: true, _count: { select: { questions: true } } },
  });
  return tests.map((t) => ({ id: t.id, title: t.title, durationMinutes: t.durationMinutes, questionCount: t._count.questions }));
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
      where: { id: mockTestId, createdById: teacherId, type: skill, isPublished: true, isArchived: false },
    });
    if (!test) throw new Error(`That ${skill.toLowerCase()} test isn't available.`);
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
    return;
  }

  const task = await createWritingTask(teacherId, {
    title: input.title,
    trainingType: "ACADEMIC",
    taskNumber: input.taskNumber,
    category: input.category,
    prompt: input.prompt,
    visualDescription: input.visualDescription,
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
  isComplete: boolean;
};

function computeCompleteness(test: {
  readingSections: unknown[];
  listeningSections: unknown[];
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

  return {
    hasReading,
    hasListening,
    hasTask1,
    hasTask2,
    hasPart1,
    hasPart2,
    hasPart3,
    isComplete: hasReading && hasListening && hasTask1 && hasTask2 && hasPart1 && hasPart2 && hasPart3,
  };
}

export async function publishFullMockTest(id: string, teacherId: string): Promise<void> {
  const test = await getFullMockTestForEdit(id, teacherId);
  if (!test) throw new Error("Full mock test not found.");

  const completeness = computeCompleteness(test);
  if (!completeness.isComplete) {
    throw new Error("Every section (Reading, Listening, Writing Task 1 & 2, Speaking Parts 1–3) must be filled in before publishing.");
  }

  await Promise.all([
    ...test.writingSections
      .filter((s) => s.writingTask.status === "DRAFT")
      .map((s) => setWritingTaskStatus(s.writingTaskId, teacherId, "PUBLISHED")),
    ...test.speakingSections
      .filter((s) => s.speakingTask.status === "DRAFT")
      .map((s) => setSpeakingTaskStatus(s.speakingTaskId, teacherId, "PUBLISHED")),
  ]);

  await prisma.fullMockTest.update({ where: { id }, data: { status: "PUBLISHED" } });
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
    where: { id, createdById: teacherId },
    include: {
      readingSections: {
        orderBy: { orderIndex: "asc" },
        include: { mockTest: { select: { id: true, title: true, durationMinutes: true, _count: { select: { questions: true } } } } },
      },
      listeningSections: {
        orderBy: { orderIndex: "asc" },
        include: { mockTest: { select: { id: true, title: true, durationMinutes: true, _count: { select: { questions: true } } } } },
      },
      writingSections: { orderBy: { orderIndex: "asc" }, include: { writingTask: true } },
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
    where: { createdById: teacherId },
    orderBy: { createdAt: "desc" },
    include: {
      readingSections: { select: { id: true } },
      listeningSections: { select: { id: true } },
      writingSections: { select: { id: true } },
      speakingSections: { select: { id: true } },
      _count: { select: { attempts: true } },
    },
  });

  return tests.map((test) => ({
    id: test.id,
    title: test.title,
    status: test.status,
    createdAt: test.createdAt,
    attemptCount: test._count.attempts,
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

/** A single published Full Mock Test's detail, for the student's pre-start confirmation page. */
export async function getPublishedFullMockTestDetail(id: string) {
  const test = await prisma.fullMockTest.findFirst({
    where: { id, status: "PUBLISHED" },
    include: {
      readingSections: { include: { mockTest: { select: { id: true, title: true, durationMinutes: true, _count: { select: { questions: true } } } } } },
      listeningSections: { include: { mockTest: { select: { id: true, title: true, durationMinutes: true, _count: { select: { questions: true } } } } } },
      writingSections: { select: { id: true } },
      speakingSections: { select: { id: true } },
    },
  });
  if (!test) return null;

  const readingMinutes = test.readingSections.reduce((sum, s) => sum + (s.mockTest.durationMinutes ?? 0), 0);
  const listeningMinutes = test.listeningSections.reduce((sum, s) => sum + (s.mockTest.durationMinutes ?? 0), 0);
  const readingQuestionCount = test.readingSections.reduce((sum, s) => sum + s.mockTest._count.questions, 0);
  const listeningQuestionCount = test.listeningSections.reduce((sum, s) => sum + s.mockTest._count.questions, 0);

  return {
    id: test.id,
    title: test.title,
    description: test.description,
    examNumber: test.examNumber,
    difficulty: test.difficulty,
    category: test.category,
    estimatedBandMin: test.estimatedBandMin,
    estimatedBandMax: test.estimatedBandMax,
    totalDurationMinutes: readingMinutes + listeningMinutes + FULL_MOCK_WRITING_MINUTES + FULL_MOCK_SPEAKING_MINUTES,
    /** Phase 40 — Part 11's "Number of Questions" on the instructions screen. Reading/Listening only — Writing/Speaking are open-response, not question-counted. */
    totalQuestionCount: readingQuestionCount + listeningQuestionCount,
  };
}
