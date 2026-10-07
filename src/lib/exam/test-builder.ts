import "server-only";

import { Prisma, type MockTestCategory } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { authorScope } from "@/lib/exam/test-access";
import { getTestEditState, assertTestEditable, type TestEditState } from "@/lib/exam/test-lock";
import { OwnershipError, deleteStoredFilesIfUnreferenced } from "@/lib/exam/test-management";
import { fromRows, toRows, type BuilderModel, type Skill } from "@/lib/exam/builder-model";
import { CUSTOM_MAX_PARTS, formatOf, type TestFormatValue } from "@/lib/exam/test-format";
import { newRowId } from "@/lib/exam/row-ids";
import { parseEvidence, reanchorItems, serializeEvidence } from "@/lib/exam/answer-evidence-store";
import { ensureRecordingLengths } from "@/lib/exam/recording-length";
import { assertOwnListeningAudio } from "@/lib/full-mock-quick-build";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";

/**
 * Phase L2 - the server side of the structured test editor.
 *
 * `saveBuilder` is the editor's ONE save: the whole test in a single transaction, rows UPSERTED by id (a question that exists keeps its id and everything
 * attached to it; a new one gets a new id) and only the rows the teacher REMOVED from the model are deleted - never delete-and-recreate. It runs only on a
 * test the L1 edit rule lets anybody change (a draft nobody has taken), and refuses a save based on an older version of the test (another tab saved since).
 */

export class BuilderConflictError extends Error {
  constructor(message = "This test was changed somewhere else (another tab or another teacher) since you opened it. Reload the page to see the latest version before you continue.") {
    super(message);
    this.name = "BuilderConflictError";
  }
}

export type BuilderPartInfo = {
  id: string;
  audioSrc: string | null;
  audioFileName: string | null;
  audioDurationSeconds: number | null;
  attachments: { id: string; type: string; imagePath: string; caption: string | null }[];
};

export type BuilderState = {
  testId: string;
  skill: Skill;
  model: BuilderModel;
  /** The version the next save must be based on (the test's updatedAt). */
  version: string;
  parts: BuilderPartInfo[];
  edit: TestEditState;
  isPublished: boolean;
  isArchived: boolean;
};

const PART_COUNT: Record<Skill, number> = { READING: 3, LISTENING: 4 };

async function loadOwnedTest(testId: string, teacherId: string) {
  const test = await prisma.mockTest.findFirst({
    where: { id: testId, ...(await authorScope(teacherId)) },
    include: {
      passages: { orderBy: { orderIndex: "asc" }, include: { attachments: { orderBy: { orderIndex: "asc" } }, questionGroups: true } },
      questions: { orderBy: { orderIndex: "asc" } },
    },
  });
  if (!test) throw new OwnershipError("You don't have access to this test.");
  if (test.type !== "READING" && test.type !== "LISTENING") throw new Error("Only Reading and Listening tests can be edited here.");
  return test;
}

export const partInfoOf = (passage: {
  id: string;
  audioPath: string | null;
  audioUrl: string | null;
  audioFileName: string | null;
  audioDurationSeconds: number | null;
  attachments: { id: string; type: string; imagePath: string; caption: string | null }[];
}): BuilderPartInfo => ({
  id: passage.id,
  audioSrc: resolvePassageAudioSrc(passage),
  audioFileName: passage.audioFileName,
  audioDurationSeconds: passage.audioDurationSeconds,
  attachments: passage.attachments.map((a) => ({ id: a.id, type: a.type, imagePath: a.imagePath, caption: a.caption })),
});

/** Everything the editor needs to open a test: the model made from the stored rows, the version to save against, the recordings and pictures of each part. */
export async function getBuilderState(testId: string, teacherId: string): Promise<BuilderState> {
  const test = await loadOwnedTest(testId, teacherId);
  const skill: Skill = test.type === "LISTENING" ? "LISTENING" : "READING";
  const model = fromRows({
    title: test.title,
    description: test.description,
    durationMinutes: test.durationMinutes,
    category: test.category,
    format: formatOf(test.testFormat),
    passages: test.passages.map((p) => ({ id: p.id, title: p.title, content: p.content, orderIndex: p.orderIndex, audioStartSeconds: p.audioStartSeconds })),
    groups: test.passages.flatMap((p) => p.questionGroups.map((g) => ({ id: g.id, passageId: g.passageId, instructions: g.instructions, orderIndex: g.orderIndex }))),
    questions: test.questions.map((q) => ({ id: q.id, passageId: q.passageId, questionGroupId: q.questionGroupId, type: q.type, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer, orderIndex: q.orderIndex })),
  });
  return {
    testId: test.id,
    skill,
    model,
    version: test.updatedAt.toISOString(),
    parts: test.passages.map(partInfoOf),
    edit: await getTestEditState(test.id),
    isPublished: test.isPublished,
    isArchived: test.isArchived,
  };
}

/** The wizard's "by hand": the test with its empty parts (3 passages / 4 parts) in place, so the editor can open on it. */
export async function createTestWithParts(
  teacherId: string,
  input: { type: Skill; title: string; description?: string; durationMinutes?: number | null; category?: MockTestCategory; format?: TestFormatValue; partCount?: number }
) {
  const testId = newRowId();
  const format: TestFormatValue = input.format === "CUSTOM" ? "CUSTOM" : "FULL_IELTS";
  // A Full IELTS test always starts with its official parts; a Custom test with the number the teacher asked for (it can add and remove parts in the editor).
  const count = format === "CUSTOM" ? Math.min(CUSTOM_MAX_PARTS, Math.max(1, Math.floor(input.partCount ?? PART_COUNT[input.type]))) : PART_COUNT[input.type];
  await prisma.$transaction([
    prisma.mockTest.create({
      data: { id: testId, title: input.title, description: input.description || null, type: input.type, testFormat: format, category: input.category ?? "GENERAL", durationMinutes: input.durationMinutes ?? (input.type === "LISTENING" ? 30 : 60), createdById: teacherId },
    }),
    prisma.passage.createMany({
      data: Array.from({ length: count }, (_, index) => ({ id: newRowId(), mockTestId: testId, title: input.type === "LISTENING" ? `Part ${index + 1}` : `Passage ${index + 1}`, content: "", orderIndex: index })),
    }),
  ]);
  return { id: testId };
}

/** The version a save must be based on right now - taken again after something else changed the test's row on purpose (the cover image). */
export async function getBuilderVersion(testId: string, teacherId: string): Promise<string> {
  const test = await prisma.mockTest.findFirst({ where: { id: testId, ...(await authorScope(teacherId)) }, select: { updatedAt: true } });
  if (!test) throw new OwnershipError("You don't have access to this test.");
  return test.updatedAt.toISOString();
}

export type SavedBuilder = {
  version: string;
  total: number;
  /** The ids given to the elements that had none yet, by the key the editor knows them under (part / group / `<group key>:row` / item). */
  ids: Record<string, string>;
  /** Phase Q - the parts with their recordings, sent when a save added or removed a part (a new part shares the recording of the others). */
  parts?: BuilderPartInfo[];
};

/**
 * The editor's save. Every id in the model must belong to THIS test (a stored id of another test is refused, never overwritten). Group ranges and titles
 * are not taken from the editor: they are derived from the rows with the student's own numbering (see toRows).
 */
export async function saveBuilder(testId: string, teacherId: string, model: BuilderModel, version: string): Promise<SavedBuilder> {
  const test = await loadOwnedTest(testId, teacherId);
  await assertTestEditable(testId); // L1: a draft nobody has attempted, not inside a live Full Mock
  if (test.updatedAt.toISOString() !== version) throw new BuilderConflictError();

  // Phase Q - a test that is part of a Full Mock must stay a Full IELTS test (40 questions): it cannot be turned into a Custom one while it is linked.
  if (model.format === "CUSTOM" && formatOf(test.testFormat) !== "CUSTOM") {
    const links = (await prisma.fullMockReadingSection.count({ where: { mockTestId: testId } })) + (await prisma.fullMockListeningSection.count({ where: { mockTestId: testId } }));
    if (links > 0 || test.packageFullMockTestId) throw new Error("This test is part of a Full Mock, and a Full Mock needs a Full IELTS test of exactly 40 questions - so it cannot be made a Custom test.");
  }

  const ownPassages = new Set(test.passages.map((p) => p.id));
  const ownGroups = new Set(test.passages.flatMap((p) => p.questionGroups.map((g) => g.id)));
  const ownQuestions = new Set(test.questions.map((q) => q.id));
  const seen = new Set<string>();
  const claim = (id: string | undefined, own: Set<string>, what: string) => {
    if (!id) return;
    if (!own.has(id)) throw new Error(`The ${what} you are saving does not belong to this test. Reload the page and try again.`);
    if (seen.has(id)) throw new Error(`The ${what} appears twice in the test. Reload the page and try again.`);
    seen.add(id);
  };
  for (const part of model.parts) {
    claim(part.passageId, ownPassages, "part");
    for (const group of part.groups) {
      claim(group.groupId, ownGroups, "question group");
      claim(group.questionId, ownQuestions, "question");
      for (const item of group.items) claim(item.questionId, ownQuestions, "question");
    }
  }

  const created: Record<string, string> = {};
  const newId = (key: string) => (created[key] ??= newRowId());
  const rows = toRows(model, newId);

  const removedPassages = test.passages.filter((p) => !rows.passages.some((row) => row.id === p.id));
  const removedFiles = removedPassages.flatMap((p) => [p.audioPath, p.audioUrl, ...p.attachments.filter((a) => !a.mediaFileId).map((a) => a.imagePath)]);
  const removedAttachmentIds = removedPassages.flatMap((p) => p.attachments.map((a) => a.id));

  const jsonb = (value: unknown) => (value === null || value === undefined ? Prisma.sql`NULL::jsonb` : Prisma.sql`${JSON.stringify(value)}::jsonb`);

  const newVersion = await prisma.$transaction(
    async (tx) => {
      // Takes the test's row: a second save based on the same version waits here, then finds the version moved on.
      const touched = await tx.mockTest.updateMany({
        where: { id: testId, updatedAt: test.updatedAt },
        data: {
          title: model.title.trim(),
          description: model.description.trim() || null,
          durationMinutes: model.durationMinutes,
          category: model.category,
          // Phase Q - the kind of paper is only written when the teacher changed it (a test with none stays as it is: none means Full IELTS).
          ...(model.format && model.format !== formatOf(test.testFormat) ? { testFormat: model.format } : {}),
        },
      });
      if (touched.count !== 1) throw new BuilderConflictError();

      if (rows.passages.length > 0) {
        await tx.$executeRaw`
          INSERT INTO "passages" ("id", "mockTestId", "title", "content", "orderIndex", "audioStartSeconds", "createdAt", "updatedAt")
          VALUES ${Prisma.join(rows.passages.map((p) => Prisma.sql`(${p.id}, ${testId}, ${p.title}, ${p.content}, ${p.orderIndex}, ${p.audioStartSeconds}, now(), now())`))}
          ON CONFLICT ("id") DO UPDATE SET "title" = EXCLUDED."title", "content" = EXCLUDED."content", "orderIndex" = EXCLUDED."orderIndex", "audioStartSeconds" = EXCLUDED."audioStartSeconds", "updatedAt" = now()
          WHERE "passages"."mockTestId" = ${testId}
            AND ("passages"."title", "passages"."content", "passages"."orderIndex", "passages"."audioStartSeconds") IS DISTINCT FROM (EXCLUDED."title", EXCLUDED."content", EXCLUDED."orderIndex", EXCLUDED."audioStartSeconds")`;
      }
      // Phase Q - a part added to a Listening test whose parts all share ONE recording shares that recording as well (the teacher uploads it once).
      const addedPassageIds = rows.passages.filter((p) => !ownPassages.has(p.id)).map((p) => p.id);
      if (test.type === "LISTENING" && addedPassageIds.length > 0 && test.passages.length > 0) {
        const recorded = test.passages.filter((p) => p.audioPath || p.audioUrl);
        const sources = new Set(recorded.map((p) => p.audioPath ?? p.audioUrl));
        if (recorded.length === test.passages.length && sources.size === 1) {
          const source = recorded[0];
          await tx.passage.updateMany({
            where: { id: { in: addedPassageIds } },
            data: {
              audioPath: source.audioPath,
              audioUrl: source.audioUrl,
              audioFileName: source.audioFileName,
              audioMimeType: source.audioMimeType,
              audioSize: source.audioSize,
              audioDurationSeconds: source.audioDurationSeconds,
            },
          });
        }
      }
      if (rows.groups.length > 0) {
        await tx.$executeRaw`
          INSERT INTO "question_groups" ("id", "passageId", "title", "startQuestion", "endQuestion", "instructions", "orderIndex", "createdAt", "updatedAt")
          VALUES ${Prisma.join(rows.groups.map((g) => Prisma.sql`(${g.id}, ${g.passageId}, ${g.title}, ${g.startQuestion}, ${g.endQuestion}, ${g.instructions}, ${g.orderIndex}, now(), now())`))}
          ON CONFLICT ("id") DO UPDATE SET "passageId" = EXCLUDED."passageId", "title" = EXCLUDED."title", "startQuestion" = EXCLUDED."startQuestion", "endQuestion" = EXCLUDED."endQuestion", "instructions" = EXCLUDED."instructions", "orderIndex" = EXCLUDED."orderIndex", "updatedAt" = now()
          WHERE "question_groups"."passageId" IN (SELECT "id" FROM "passages" WHERE "mockTestId" = ${testId})
            AND ("question_groups"."passageId", "question_groups"."title", "question_groups"."startQuestion", "question_groups"."endQuestion", "question_groups"."instructions", "question_groups"."orderIndex")
              IS DISTINCT FROM (EXCLUDED."passageId", EXCLUDED."title", EXCLUDED."startQuestion", EXCLUDED."endQuestion", EXCLUDED."instructions", EXCLUDED."orderIndex")`;
      }
      if (rows.questions.length > 0) {
        await tx.$executeRaw`
          INSERT INTO "questions" ("id", "mockTestId", "passageId", "questionGroupId", "type", "prompt", "options", "correctAnswer", "orderIndex", "points", "createdAt", "updatedAt")
          VALUES ${Prisma.join(rows.questions.map((q) => Prisma.sql`(${q.id}, ${testId}, ${q.passageId}, ${q.questionGroupId}, ${q.type}::"QuestionType", ${q.prompt}, ${jsonb(q.options)}, ${jsonb(q.correctAnswer)}, ${q.orderIndex}, ${q.points}, now(), now())`))}
          ON CONFLICT ("id") DO UPDATE SET "passageId" = EXCLUDED."passageId", "questionGroupId" = EXCLUDED."questionGroupId", "type" = EXCLUDED."type", "prompt" = EXCLUDED."prompt", "options" = EXCLUDED."options", "correctAnswer" = EXCLUDED."correctAnswer", "orderIndex" = EXCLUDED."orderIndex", "points" = EXCLUDED."points", "updatedAt" = now()
          WHERE "questions"."mockTestId" = ${testId}
            AND ("questions"."passageId", "questions"."questionGroupId", "questions"."type", "questions"."prompt", "questions"."options", "questions"."correctAnswer", "questions"."orderIndex", "questions"."points")
              IS DISTINCT FROM (EXCLUDED."passageId", EXCLUDED."questionGroupId", EXCLUDED."type", EXCLUDED."prompt", EXCLUDED."options", EXCLUDED."correctAnswer", EXCLUDED."orderIndex", EXCLUDED."points")`;
      }

      // Only what the teacher removed from the model goes: rows of this test whose id is no longer in it.
      const keepQuestions = rows.questions.map((q) => q.id);
      const keepGroups = rows.groups.map((g) => g.id);
      const keepPassages = rows.passages.map((p) => p.id);
      await tx.$executeRaw`DELETE FROM "questions" WHERE "mockTestId" = ${testId} AND "id" <> ALL(${keepQuestions}::text[])`;

      // Phase M - answer evidence follows its words: a passage whose text was edited has the evidence of its questions looked for again by quote; where the
      // words are gone the item is dropped (never left pointing at other words). The question upserts above never write the evidence column.
      const oldContent = new Map(test.passages.map((p) => [p.id, p.content]));
      const edited = rows.passages.filter((p) => oldContent.has(p.id) && oldContent.get(p.id) !== p.content);
      if (edited.length > 0) {
        const withEvidence = await tx.$queryRaw<{ id: string; evidence: unknown }[]>`SELECT "id", "evidence" FROM "questions" WHERE "mockTestId" = ${testId} AND "evidence" IS NOT NULL`;
        for (const question of withEvidence) {
          const before = parseEvidence(question.evidence);
          if (!before.some((item) => edited.some((p) => p.id === item.passageId))) continue;
          const after = edited.reduce((items, p) => reanchorItems(items, p.id, p.content).items, before);
          if (JSON.stringify(after) !== JSON.stringify(before)) await tx.$executeRaw`UPDATE "questions" SET "evidence" = ${jsonb(serializeEvidence(after))}, "updatedAt" = now() WHERE "id" = ${question.id}`;
        }
      }
      await tx.$executeRaw`DELETE FROM "question_groups" WHERE "passageId" IN (SELECT "id" FROM "passages" WHERE "mockTestId" = ${testId}) AND "id" <> ALL(${keepGroups}::text[])`;
      if (removedAttachmentIds.length > 0) await tx.mediaUsage.deleteMany({ where: { context: "PASSAGE_ATTACHMENT", referenceId: { in: removedAttachmentIds } } });
      await tx.$executeRaw`DELETE FROM "passages" WHERE "mockTestId" = ${testId} AND "id" <> ALL(${keepPassages}::text[])`;

      const after = await tx.mockTest.findUnique({ where: { id: testId }, select: { updatedAt: true } });
      return after!.updatedAt.toISOString();
    },
    { timeout: 120_000, maxWait: 30_000 }
  );

  if (removedFiles.length > 0) await deleteStoredFilesIfUnreferenced(removedFiles);
  const partsChanged = removedPassages.length > 0 || rows.passages.some((p) => !ownPassages.has(p.id));
  return { version: newVersion, total: rows.total, ids: created, ...(partsChanged ? { parts: await partInfos(testId) } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Listening recordings (Phase L2): uploaded by the browser straight to storage (a signed upload - the file never passes through a server action, whose body
// is limited), attached here, and measured here: the length is read from the file itself, never taken from the browser.
// ---------------------------------------------------------------------------------------------------------------------------------------------------

async function partInfos(testId: string): Promise<BuilderPartInfo[]> {
  const passages = await prisma.passage.findMany({ where: { mockTestId: testId }, orderBy: { orderIndex: "asc" }, include: { attachments: { orderBy: { orderIndex: "asc" } } } });
  return passages.map(partInfoOf);
}

/**
 * Attaches the recording the browser just uploaded: to one part, or (no `passageId`) to EVERY part as the one shared recording of the test. Measures its
 * length now and returns the parts with their recordings. A recording it replaces is deleted from storage unless something else still uses it.
 */
export async function attachBuilderAudio(
  testId: string,
  teacherId: string,
  audio: { url: string; fileName: string; mimeType: string; size: number },
  passageId?: string
): Promise<{ parts: BuilderPartInfo[] }> {
  const test = await loadOwnedTest(testId, teacherId);
  if (test.type !== "LISTENING") throw new Error("Only a Listening test has a recording.");
  await assertTestEditable(testId);
  assertOwnListeningAudio(teacherId, audio);

  const targets = passageId ? test.passages.filter((p) => p.id === passageId) : test.passages;
  if (targets.length === 0) throw new Error(passageId ? "That part does not belong to this test." : "The test has no parts to attach the recording to.");
  const replaced = targets.flatMap((p) => [p.audioPath, p.audioUrl]);

  await prisma.passage.updateMany({
    where: { id: { in: targets.map((p) => p.id) } },
    data: { audioPath: audio.url, audioFileName: audio.fileName.slice(0, 255), audioMimeType: audio.mimeType, audioSize: audio.size, audioDurationSeconds: null },
  });
  // The length is read from the file now, so the editor can check the start times against it and the Listening deadline can be built from it.
  await ensureRecordingLengths(testId).catch(() => null);
  await deleteStoredFilesIfUnreferenced(replaced.filter((ref) => ref && ref !== audio.url));
  return { parts: await partInfos(testId) };
}

/** Removes the recording of one part, or of every part. The file goes from storage unless another part still uses it. */
export async function removeBuilderAudio(testId: string, teacherId: string, passageId?: string): Promise<{ parts: BuilderPartInfo[] }> {
  const test = await loadOwnedTest(testId, teacherId);
  await assertTestEditable(testId);
  const targets = passageId ? test.passages.filter((p) => p.id === passageId) : test.passages;
  const files = targets.flatMap((p) => [p.audioPath, p.audioUrl]);
  await prisma.passage.updateMany({
    where: { id: { in: targets.map((p) => p.id) } },
    data: { audioPath: null, audioUrl: null, audioFileName: null, audioMimeType: null, audioSize: null, audioDurationSeconds: null },
  });
  await deleteStoredFilesIfUnreferenced(files);
  return { parts: await partInfos(testId) };
}
