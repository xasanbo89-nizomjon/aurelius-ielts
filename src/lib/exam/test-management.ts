import type { MockTestCategory, PassageAttachmentType, Prisma, QuestionType, TestType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { summaryBlankKeys } from "@/lib/exam/question-numbering";
import { scheduleRecordingMeasure } from "@/lib/exam/recording-length";
import { deleteBucketObjects, deleteStoredFiles } from "@/lib/uploads/storage-cleanup";
import { TEST_IMPORT_PDF_BUCKET } from "@/lib/uploads/bucket-names";

export class OwnershipError extends Error {
  constructor(message = "You don't have access to this resource.") {
    super(message);
    this.name = "OwnershipError";
  }
}

async function assertOwnsTest(mockTestId: string, teacherId: string) {
  const test = await prisma.mockTest.findFirst({ where: { id: mockTestId, createdById: teacherId } });
  if (!test) throw new OwnershipError("You don't have access to this test.");
  return test;
}

async function assertOwnsPassage(passageId: string, teacherId: string) {
  const passage = await prisma.passage.findFirst({
    where: { id: passageId, mockTest: { createdById: teacherId } },
  });
  if (!passage) throw new OwnershipError("You don't have access to this passage.");
  return passage;
}

async function assertOwnsQuestion(questionId: string, teacherId: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, mockTest: { createdById: teacherId } },
  });
  if (!question) throw new OwnershipError("You don't have access to this question.");
  return question;
}

async function assertOwnsQuestionGroup(groupId: string, teacherId: string) {
  const group = await prisma.questionGroup.findFirst({
    where: { id: groupId, passage: { mockTest: { createdById: teacherId } } },
  });
  if (!group) throw new OwnershipError("You don't have access to this question group.");
  return group;
}

/** Validates a question's `options`/`correctAnswer` against its type's schema. Throws on mismatch. */
export function validateQuestionPayload(type: QuestionType, options: unknown, correctAnswer: unknown) {
  const meta = QUESTION_TYPE_META[type];
  const parsedOptions = meta.optionsSchema.parse(options ?? {});
  const parsedAnswer = meta.responseSchema.parse(correctAnswer);

  // A summary's blanks exist only where its text has a `{{n}}` marker — without one the student gets a paragraph and nothing to type into, and the question numbering would count blanks that can't be answered.
  if (type === "SUMMARY_COMPLETION") {
    const { text, blankCount } = parsedOptions as { text: string; blankCount: number };
    const markers = summaryBlankKeys(text).length;
    if (markers !== blankCount) {
      throw new Error(
        markers === 0
          ? "The summary has no blanks — write {{1}}, {{2}}, … in the text where each answer box should go."
          : `The summary text has ${markers} blank${markers === 1 ? "" : "s"} ({{n}} markers) but is set up for ${blankCount}. Make them match.`
      );
    }
  }
  return { options: parsedOptions, correctAnswer: parsedAnswer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export async function createTest(
  teacherId: string,
  input: {
    title: string;
    description?: string;
    type: TestType;
    category?: MockTestCategory;
    durationMinutes?: number;
  }
) {
  return prisma.mockTest.create({
    data: {
      title: input.title,
      description: input.description,
      type: input.type,
      category: input.category,
      durationMinutes: input.durationMinutes,
      createdById: teacherId,
    },
  });
}

export async function updateTest(
  testId: string,
  teacherId: string,
  input: {
    title?: string;
    description?: string;
    durationMinutes?: number | null;
    category?: MockTestCategory;
    coverImagePath?: string | null;
  }
) {
  await assertOwnsTest(testId, teacherId);
  return prisma.mockTest.update({ where: { id: testId }, data: input });
}

export async function setPublished(testId: string, teacherId: string, isPublished: boolean) {
  const test = await assertOwnsTest(testId, teacherId);

  if (isPublished) {
    const questionCount = await prisma.question.count({ where: { mockTestId: testId } });
    if (questionCount === 0) {
      throw new Error("Add at least one question before publishing.");
    }
  }

  return prisma.mockTest.update({
    where: { id: test.id },
    data: { isPublished, isArchived: isPublished ? false : test.isArchived },
  });
}

export async function setArchived(testId: string, teacherId: string, isArchived: boolean) {
  await assertOwnsTest(testId, teacherId);
  return prisma.mockTest.update({
    where: { id: testId },
    data: { isArchived, isPublished: isArchived ? false : undefined },
  });
}

/**
 * Phase A — removes stored files ONLY if no remaining row still points at
 * them. A Listening test's single recording is attached to each of its
 * sections (see attachListeningAudio), so deleting or replacing one section
 * must not pull the file out from under the others. Called after the database
 * change, so any reference still found belongs to a row that survives it.
 */
export async function deleteStoredFilesIfUnreferenced(references: ReadonlyArray<string | null | undefined>) {
  const refs = [...new Set(references.filter((ref): ref is string => Boolean(ref)))];
  if (refs.length === 0) return { removed: 0, failed: [] as string[] };

  const [passages, attachments, covers] = await Promise.all([
    prisma.passage.findMany({ where: { OR: [{ audioPath: { in: refs } }, { audioUrl: { in: refs } }] }, select: { audioPath: true, audioUrl: true } }),
    prisma.passageAttachment.findMany({ where: { imagePath: { in: refs } }, select: { imagePath: true } }),
    prisma.mockTest.findMany({ where: { coverImagePath: { in: refs } }, select: { coverImagePath: true } }),
  ]);
  const stillUsed = new Set<string>([
    ...passages.flatMap((p) => [p.audioPath, p.audioUrl]),
    ...attachments.map((a) => a.imagePath),
    ...covers.map((c) => c.coverImagePath),
  ].filter((ref): ref is string => Boolean(ref)));

  return deleteStoredFiles(refs.filter((ref) => !stillUsed.has(ref)));
}

/**
 * Phase B — everything a set of tests keeps in Storage or points at from
 * outside the cascade: audio, directly-uploaded attachment images and covers
 * (stored URLs), the Media Library usage rows of their attachments, and the PDF
 * import records (plus the source PDFs) the tests were created from. Gathered
 * BEFORE the delete so nothing has to be guessed afterwards.
 */
export async function collectTestDependencies(testIds: string[]) {
  const [tests, passages, attachments, imports] = await Promise.all([
    prisma.mockTest.findMany({ where: { id: { in: testIds } }, select: { coverImagePath: true } }),
    prisma.passage.findMany({ where: { mockTestId: { in: testIds } }, select: { audioPath: true, audioUrl: true } }),
    prisma.passageAttachment.findMany({ where: { passage: { mockTestId: { in: testIds } } }, select: { id: true, imagePath: true, mediaFileId: true } }),
    prisma.importedTest.findMany({ where: { resultMockTestId: { in: testIds } }, select: { id: true, pdfPath: true } }),
  ]);

  return {
    fileRefs: [
      ...tests.map((test) => test.coverImagePath),
      ...passages.flatMap((passage) => [passage.audioPath, passage.audioUrl]),
      // Library-picked attachments are the Media Library's own files and are deliberately left alone.
      ...attachments.filter((attachment) => !attachment.mediaFileId).map((attachment) => attachment.imagePath),
    ],
    attachmentIds: attachments.map((attachment) => attachment.id),
    importIds: imports.map((row) => row.id),
    importPdfPaths: imports.map((row) => row.pdfPath),
  };
}

export type DeleteTestOptions = {
  /** The teacher explicitly confirmed also deleting the students' attempts on this test. Without it a test that anyone has attempted is refused. */
  deleteResults?: boolean;
};

export type DeleteTestOutcome = {
  /** Uploaded files (audio, attachment images, cover) removed from storage along with the test. */
  removedFiles: number;
  /** Stored references that could NOT be removed — the database is already clean, only these files remain. */
  failedFiles: string[];
  deletedAttempts: number;
};

/** Phase A — what a test would take with it, for the confirmation dialog and for deleteTest itself. */
export async function getTestDeletionImpact(testId: string, teacherId: string) {
  await assertOwnsTest(testId, teacherId);
  const [attempts, readingUses, listeningUses] = await Promise.all([
    prisma.result.count({ where: { mockTestId: testId } }),
    prisma.fullMockReadingSection.findMany({ where: { mockTestId: testId }, select: { fullMockTest: { select: { title: true } } } }),
    prisma.fullMockListeningSection.findMany({ where: { mockTestId: testId }, select: { fullMockTest: { select: { title: true } } } }),
  ]);
  const fullMockTitles = [...new Set([...readingUses, ...listeningUses].map((use) => use.fullMockTest.title))];
  return { attempts, fullMockTitles };
}

/**
 * Phase A — deletes a Reading/Listening test and EVERYTHING that hangs off it,
 * so nothing is left behind:
 *  - database: passages, question groups, questions (the answer key), student
 *    attempts + their answers/highlights/notes, bookmarks, AI explanations (all
 *    cascade from the test), plus the Media Library usage rows that point at
 *    its attachments (they aren't foreign keys, and a stale one would block
 *    deleting that media file forever);
 *  - storage: the listening audio, directly-uploaded attachment images and the
 *    cover image. Library-picked attachments are the Media Library's own files
 *    and are deliberately left alone.
 * Two guards: a test inside a Full Mock must be removed from it first (the
 * cascade would otherwise silently gut that mock), and a test students have
 * attempted is only deleted when the caller confirms the attempts go too.
 * Files are removed AFTER the database delete commits, best-effort — see
 * deleteStoredFiles.
 */
export async function deleteTest(testId: string, teacherId: string, options: DeleteTestOptions = {}): Promise<DeleteTestOutcome> {
  const test = await assertOwnsTest(testId, teacherId);

  const impact = await getTestDeletionImpact(testId, teacherId);
  if (test.packageFullMockTestId) {
    const owner = await prisma.fullMockTest.findUnique({ where: { id: test.packageFullMockTestId }, select: { title: true } });
    throw new Error(`This test is one section of the Full Mock "${owner?.title ?? "its package"}" it was built for. Delete that Full Mock to delete it.`);
  }
  if (impact.fullMockTitles.length > 0) {
    const titles = impact.fullMockTitles.map((title) => `"${title}"`).join(", ");
    throw new Error(
      `This test is part of the Full Mock ${impact.fullMockTitles.length === 1 ? "test" : "tests"} ${titles}. Remove it from ${impact.fullMockTitles.length === 1 ? "that mock" : "those mocks"} first, then delete it.`
    );
  }
  if (impact.attempts > 0 && !options.deleteResults) {
    throw new Error(
      `This test has ${impact.attempts} student attempt${impact.attempts === 1 ? "" : "s"}. Confirm that you want to delete them too, or archive the test instead.`
    );
  }

  const deps = await collectTestDependencies([testId]);

  await prisma.$transaction([
    prisma.mediaUsage.deleteMany({ where: { context: "PASSAGE_ATTACHMENT", referenceId: { in: deps.attachmentIds } } }),
    // The PDF import this test came from would otherwise be left saying "Imported" with nothing to point at.
    prisma.importedTest.deleteMany({ where: { id: { in: deps.importIds } } }),
    prisma.mockTest.delete({ where: { id: testId } }),
  ]);

  const [cleanup, pdfCleanup] = await Promise.all([
    deleteStoredFilesIfUnreferenced([test.coverImagePath, ...deps.fileRefs]),
    deleteBucketObjects(TEST_IMPORT_PDF_BUCKET, deps.importPdfPaths),
  ]);

  return { removedFiles: cleanup.removed + pdfCleanup.removed, failedFiles: [...cleanup.failed, ...pdfCleanup.failed], deletedAttempts: impact.attempts };
}

// ---------------------------------------------------------------------------
// Passages
// ---------------------------------------------------------------------------

type PassageAudioInput = {
  audioUrl?: string;
  audioPath?: string;
  audioFileName?: string;
  audioMimeType?: string;
  audioSize?: number;
};

export async function addPassage(
  testId: string,
  teacherId: string,
  input: { title: string; content: string } & PassageAudioInput
) {
  await assertOwnsTest(testId, teacherId);

  const maxOrder = await prisma.passage.aggregate({
    where: { mockTestId: testId },
    _max: { orderIndex: true },
  });

  const created = await prisma.passage.create({
    data: {
      mockTestId: testId,
      title: input.title,
      content: input.content,
      audioUrl: input.audioUrl,
      audioPath: input.audioPath,
      audioFileName: input.audioFileName,
      audioMimeType: input.audioMimeType,
      audioSize: input.audioSize,
      orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
    },
  });
  // Phase K - a new recording gets its length measured on the server (the Listening deadline is built from it).
  if (input.audioPath || input.audioUrl) scheduleRecordingMeasure(testId);
  return created;
}

export async function updatePassage(
  passageId: string,
  teacherId: string,
  input: { title?: string; content?: string } & PassageAudioInput
) {
  const existing = await assertOwnsPassage(passageId, teacherId);
  // Audio fields are only ever included by the caller when a fresh upload
  // just happened (see PassageEditorDialog) — otherwise they're omitted
  // entirely so an existing passage's audio is left untouched, not cleared.
  const audioChanged = input.audioPath !== undefined || input.audioUrl !== undefined;
  // A new recording invalidates the stored length of the old one (Phase K).
  const updated = await prisma.passage.update({ where: { id: passageId }, data: audioChanged ? { ...input, audioDurationSeconds: null } : input });
  if (audioChanged && (input.audioPath || input.audioUrl)) scheduleRecordingMeasure(existing.mockTestId);

  // Phase A — replacing the audio must not strand the old file in storage.
  const replacedFiles = [
    input.audioPath !== undefined && input.audioPath !== existing.audioPath ? existing.audioPath : null,
    input.audioUrl !== undefined && input.audioUrl !== existing.audioUrl ? existing.audioUrl : null,
  ];
  await deleteStoredFilesIfUnreferenced(replacedFiles);

  return updated;
}

export async function deletePassage(passageId: string, teacherId: string) {
  const passage = await assertOwnsPassage(passageId, teacherId);

  const gradedAnswerCount = await prisma.answer.count({
    where: { question: { passageId }, result: { completedAt: { not: null } } },
  });
  if (gradedAnswerCount > 0) {
    throw new Error("This passage has questions from a completed student attempt and can't be deleted.");
  }

  const attachments = await prisma.passageAttachment.findMany({
    where: { passageId },
    select: { id: true, imagePath: true, mediaFileId: true },
  });

  await prisma.$transaction([
    // Media Library usage rows aren't foreign keys, so they must go explicitly (see deleteTest).
    prisma.mediaUsage.deleteMany({ where: { context: "PASSAGE_ATTACHMENT", referenceId: { in: attachments.map((a) => a.id) } } }),
    prisma.passage.delete({ where: { id: passageId } }),
  ]);

  await deleteStoredFilesIfUnreferenced([
    passage.audioPath,
    passage.audioUrl,
    ...attachments.filter((attachment) => !attachment.mediaFileId).map((attachment) => attachment.imagePath),
  ]);
}

/**
 * Phase B — removes a section's audio: clears the fields and deletes the stored
 * file (unless another section still uses the same recording, which is how a
 * one-recording Listening test is built). Refused while the test is published
 * or part of a published Full Mock — students would be left with a silent
 * Listening test.
 */
async function assertAudioCanBeRemoved(testId: string) {
  const test = await prisma.mockTest.findUnique({
    where: { id: testId },
    select: {
      isPublished: true,
      fullMockListeningUses: { select: { fullMockTest: { select: { title: true, status: true } } } },
    },
  });
  if (!test) throw new Error("Test not found.");
  const liveMock = test.fullMockListeningUses.find((use) => use.fullMockTest.status === "PUBLISHED");
  if (liveMock) throw new Error(`This audio is used by the published Full Mock "${liveMock.fullMockTest.title}". Unpublish that mock first.`);
  if (test.isPublished) throw new Error("This test is published — unpublish it before removing its audio, or upload a replacement instead.");
}

const NO_AUDIO = { audioPath: null, audioUrl: null, audioFileName: null, audioMimeType: null, audioSize: null, audioDurationSeconds: null } as const;

export async function removePassageAudio(passageId: string, teacherId: string) {
  const passage = await assertOwnsPassage(passageId, teacherId);
  if (!passage.audioPath && !passage.audioUrl) throw new Error("This section has no audio to remove.");
  await assertAudioCanBeRemoved(passage.mockTestId);

  await prisma.passage.update({ where: { id: passageId }, data: NO_AUDIO });
  return deleteStoredFilesIfUnreferenced([passage.audioPath, passage.audioUrl]);
}

export async function removeTestAudio(testId: string, teacherId: string) {
  await assertOwnsTest(testId, teacherId);
  const passages = await prisma.passage.findMany({ where: { mockTestId: testId, OR: [{ audioPath: { not: null } }, { audioUrl: { not: null } }] }, select: { id: true, audioPath: true, audioUrl: true } });
  if (passages.length === 0) throw new Error("This test has no audio to remove.");
  await assertAudioCanBeRemoved(testId);

  await prisma.passage.updateMany({ where: { id: { in: passages.map((passage) => passage.id) } }, data: NO_AUDIO });
  const cleanup = await deleteStoredFilesIfUnreferenced(passages.flatMap((passage) => [passage.audioPath, passage.audioUrl]));
  return { sectionsCleared: passages.length, ...cleanup };
}

// ---------------------------------------------------------------------------
// Passage attachments (Phase 35) — real visual materials (charts, tables,
// diagrams, maps), each an uploaded image shown alongside the passage text
// or listening audio.
// ---------------------------------------------------------------------------

export async function addPassageAttachment(
  passageId: string,
  teacherId: string,
  input: { type: PassageAttachmentType; imagePath: string; caption?: string; mediaFileId?: string }
) {
  await assertOwnsPassage(passageId, teacherId);

  if (input.mediaFileId) {
    const mediaFile = await prisma.mediaFile.findFirst({ where: { id: input.mediaFileId, ownerId: teacherId } });
    if (!mediaFile) throw new OwnershipError("You don't have access to that media file.");
  }

  const maxOrder = await prisma.passageAttachment.aggregate({
    where: { passageId },
    _max: { orderIndex: true },
  });

  const attachment = await prisma.passageAttachment.create({
    data: {
      passageId,
      type: input.type,
      imagePath: input.imagePath,
      caption: input.caption || null,
      orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
      mediaFileId: input.mediaFileId ?? null,
    },
  });

  if (input.mediaFileId) {
    await prisma.mediaUsage.create({ data: { mediaFileId: input.mediaFileId, context: "PASSAGE_ATTACHMENT", referenceId: attachment.id } });
  }

  return attachment;
}

export async function deletePassageAttachment(attachmentId: string, teacherId: string) {
  const attachment = await prisma.passageAttachment.findFirst({
    where: { id: attachmentId, passage: { mockTest: { createdById: teacherId } } },
  });
  if (!attachment) throw new OwnershipError("You don't have access to this attachment.");

  await prisma.$transaction([
    prisma.mediaUsage.deleteMany({ where: { context: "PASSAGE_ATTACHMENT", referenceId: attachmentId } }),
    prisma.passageAttachment.delete({ where: { id: attachmentId } }),
  ]);

  // Phase A — a directly-uploaded image goes with its row; one picked from the Media Library is that library's file and stays.
  if (!attachment.mediaFileId) await deleteStoredFilesIfUnreferenced([attachment.imagePath]);
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export type QuestionInput = {
  passageId?: string | null;
  /** Phase 50.1 — optional teacher-side organization (see QuestionGroup). Never affects grading or the student view. */
  questionGroupId?: string | null;
  type: QuestionType;
  prompt: string;
  options: Prisma.InputJsonValue;
  correctAnswer: Prisma.InputJsonValue;
  points: number;
};

export async function addQuestion(testId: string, teacherId: string, input: QuestionInput) {
  await assertOwnsTest(testId, teacherId);
  validateQuestionPayload(input.type, input.options, input.correctAnswer);

  const maxOrder = await prisma.question.aggregate({
    where: { mockTestId: testId },
    _max: { orderIndex: true },
  });

  return prisma.question.create({
    data: {
      mockTestId: testId,
      passageId: input.passageId || null,
      questionGroupId: input.questionGroupId || null,
      type: input.type,
      prompt: input.prompt,
      options: input.options,
      correctAnswer: input.correctAnswer,
      points: input.points,
      orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
    },
  });
}

export async function updateQuestion(
  questionId: string,
  teacherId: string,
  input: Partial<QuestionInput>
) {
  const existing = await assertOwnsQuestion(questionId, teacherId);
  const type = input.type ?? existing.type;
  const options = input.options ?? existing.options;
  const correctAnswer = input.correctAnswer ?? existing.correctAnswer;
  validateQuestionPayload(type, options, correctAnswer);

  return prisma.question.update({
    where: { id: questionId },
    data: {
      passageId: input.passageId === undefined ? undefined : input.passageId || null,
      questionGroupId: input.questionGroupId === undefined ? undefined : input.questionGroupId || null,
      type: input.type,
      prompt: input.prompt,
      options: input.options,
      correctAnswer: input.correctAnswer,
      points: input.points,
    },
  });
}

export async function deleteQuestion(questionId: string, teacherId: string) {
  await assertOwnsQuestion(questionId, teacherId);

  const gradedAnswerCount = await prisma.answer.count({
    where: { questionId, result: { completedAt: { not: null } } },
  });
  if (gradedAnswerCount > 0) {
    throw new Error("This question is part of a completed student attempt and can't be deleted.");
  }

  await prisma.question.delete({ where: { id: questionId } });
}

export async function moveQuestion(questionId: string, teacherId: string, direction: "up" | "down") {
  const question = await assertOwnsQuestion(questionId, teacherId);

  const neighbor = await prisma.question.findFirst({
    where: {
      mockTestId: question.mockTestId,
      orderIndex: direction === "up" ? { lt: question.orderIndex } : { gt: question.orderIndex },
    },
    orderBy: { orderIndex: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.question.update({ where: { id: question.id }, data: { orderIndex: neighbor.orderIndex } }),
    prisma.question.update({ where: { id: neighbor.id }, data: { orderIndex: question.orderIndex } }),
  ]);
}

// ---------------------------------------------------------------------------
// Question groups (Phase 50.1) — teacher-side organization within a passage,
// e.g. "Questions 1-5". Purely cosmetic: never read by grading or the
// student exam-taking UI.
// ---------------------------------------------------------------------------

export type QuestionGroupInput = {
  title: string;
  startQuestion: number;
  endQuestion: number;
  instructions?: string | null;
};

export async function addQuestionGroup(passageId: string, teacherId: string, input: QuestionGroupInput) {
  await assertOwnsPassage(passageId, teacherId);

  const maxOrder = await prisma.questionGroup.aggregate({
    where: { passageId },
    _max: { orderIndex: true },
  });

  return prisma.questionGroup.create({
    data: {
      passageId,
      title: input.title,
      startQuestion: input.startQuestion,
      endQuestion: input.endQuestion,
      instructions: input.instructions || null,
      orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
    },
  });
}

export async function updateQuestionGroup(groupId: string, teacherId: string, input: Partial<QuestionGroupInput>) {
  await assertOwnsQuestionGroup(groupId, teacherId);
  return prisma.questionGroup.update({
    where: { id: groupId },
    data: {
      title: input.title,
      startQuestion: input.startQuestion,
      endQuestion: input.endQuestion,
      instructions: input.instructions === undefined ? undefined : input.instructions || null,
    },
  });
}

/** Deleting a group only ungroups its questions (onDelete: SetNull) — it never deletes a question or any real student Answer history attached to it. */
export async function deleteQuestionGroup(groupId: string, teacherId: string) {
  await assertOwnsQuestionGroup(groupId, teacherId);
  await prisma.questionGroup.delete({ where: { id: groupId } });
}

export async function moveQuestionGroup(groupId: string, teacherId: string, direction: "up" | "down") {
  const group = await assertOwnsQuestionGroup(groupId, teacherId);

  const neighbor = await prisma.questionGroup.findFirst({
    where: {
      passageId: group.passageId,
      orderIndex: direction === "up" ? { lt: group.orderIndex } : { gt: group.orderIndex },
    },
    orderBy: { orderIndex: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.questionGroup.update({ where: { id: group.id }, data: { orderIndex: neighbor.orderIndex } }),
    prisma.questionGroup.update({ where: { id: neighbor.id }, data: { orderIndex: group.orderIndex } }),
  ]);
}
