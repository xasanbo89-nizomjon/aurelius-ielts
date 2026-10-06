import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canManageTest, getTestActor } from "@/lib/exam/test-access";
import { OwnershipError } from "@/lib/exam/test-management";

/**
 * Phase L1 - "Create new version" and "Duplicate": a complete copy of a test, always a DRAFT, made of NEW rows (new ids for the test, passages, groups,
 * attachments and questions). Nothing that points at the source is moved:
 *
 *   - the Full Mocks, assignments and access codes that use the old test keep using it, until a teacher switches them on purpose;
 *   - every attempt stays on the test it was taken on - the copy starts with none;
 *   - uploaded files (recording, images, cover) are shared by reference: the storage cleanup only ever removes a file nothing points at any more.
 *
 * A version remembers where it came from (`versionOfId`); a duplicate is a fresh test with no link back.
 */
export type CopyMode = "version" | "duplicate";

const TITLE_SUFFIX: Record<CopyMode, string> = { version: " (new version)", duplicate: " (copy)" };

/** A cuid-shaped id made here, so a whole test can be written in a handful of statements instead of one round trip per row. */
function newId(): string {
  return `c${Date.now().toString(36)}${randomBytes(10).toString("hex").slice(0, 16)}`;
}

const json = (value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull => (value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue));

export async function copyTest(testId: string, teacherId: string, mode: CopyMode): Promise<{ id: string; title: string }> {
  const actor = await getTestActor(teacherId);
  const source = await prisma.mockTest.findUnique({
    where: { id: testId },
    include: {
      passages: { orderBy: { orderIndex: "asc" }, include: { attachments: { orderBy: { orderIndex: "asc" } }, questionGroups: { orderBy: { orderIndex: "asc" } } } },
      questions: { orderBy: { orderIndex: "asc" } },
    },
  });
  if (!source || !canManageTest(actor, source)) throw new OwnershipError("You don't have access to this test.");
  if (source.type !== "READING" && source.type !== "LISTENING") throw new Error("Only Reading and Listening tests can be copied here.");

  const newTestId = newId();
  const passageIds = new Map<string, string>();
  const groupIds = new Map<string, string>();
  const attachmentRows: Prisma.PassageAttachmentCreateManyInput[] = [];
  const mediaUsageRows: Prisma.MediaUsageCreateManyInput[] = [];
  const groupRows: Prisma.QuestionGroupCreateManyInput[] = [];

  const passageRows: Prisma.PassageCreateManyInput[] = source.passages.map((passage) => {
    const passageId = newId();
    passageIds.set(passage.id, passageId);
    for (const group of passage.questionGroups) {
      const groupId = newId();
      groupIds.set(group.id, groupId);
      groupRows.push({ id: groupId, passageId, title: group.title, startQuestion: group.startQuestion, endQuestion: group.endQuestion, instructions: group.instructions, orderIndex: group.orderIndex });
    }
    for (const attachment of passage.attachments) {
      const attachmentId = newId();
      attachmentRows.push({ id: attachmentId, passageId, type: attachment.type, imagePath: attachment.imagePath, caption: attachment.caption, orderIndex: attachment.orderIndex, mediaFileId: attachment.mediaFileId });
      if (attachment.mediaFileId) mediaUsageRows.push({ mediaFileId: attachment.mediaFileId, context: "PASSAGE_ATTACHMENT", referenceId: attachmentId });
    }
    return {
      id: passageId,
      mockTestId: newTestId,
      title: passage.title,
      content: passage.content,
      audioUrl: passage.audioUrl,
      audioPath: passage.audioPath,
      audioFileName: passage.audioFileName,
      audioMimeType: passage.audioMimeType,
      audioSize: passage.audioSize,
      audioDurationSeconds: passage.audioDurationSeconds,
      audioStartSeconds: passage.audioStartSeconds,
      orderIndex: passage.orderIndex,
    };
  });

  const questionRows: Prisma.QuestionCreateManyInput[] = source.questions.map((question) => ({
    id: newId(),
    mockTestId: newTestId,
    passageId: question.passageId ? (passageIds.get(question.passageId) ?? null) : null,
    questionGroupId: question.questionGroupId ? (groupIds.get(question.questionGroupId) ?? null) : null,
    type: question.type,
    prompt: question.prompt,
    options: json(question.options),
    correctAnswer: json(question.correctAnswer),
    orderIndex: question.orderIndex,
    points: question.points,
  }));

  const title = `${source.title}${TITLE_SUFFIX[mode]}`;
  await prisma.$transaction([
    prisma.mockTest.create({
      data: {
        id: newTestId,
        title,
        description: source.description,
        type: source.type,
        category: source.category,
        difficulty: source.difficulty,
        durationMinutes: source.durationMinutes,
        coverImagePath: source.coverImagePath,
        // A new version stays with the author of the test it replaces (a Root Teacher making it for them changes nothing); a duplicate belongs to whoever made it.
        createdById: mode === "version" ? source.createdById : teacherId,
        versionOfId: mode === "version" ? source.id : null,
        isPublished: false,
        isArchived: false,
        packageFullMockTestId: null,
      },
    }),
    prisma.passage.createMany({ data: passageRows }),
    prisma.questionGroup.createMany({ data: groupRows }),
    prisma.passageAttachment.createMany({ data: attachmentRows }),
    prisma.mediaUsage.createMany({ data: mediaUsageRows }),
    prisma.question.createMany({ data: questionRows }),
  ]);

  return { id: newTestId, title };
}

/** What depends on a test and what came from it: shown on the test's page so nobody switches a Full Mock by accident. */
export type TestVersionInfo = {
  versionOf: { id: string; title: string; isPublished: boolean } | null;
  newerVersions: { id: string; title: string; isPublished: boolean; createdAt: Date }[];
  fullMocks: { id: string; title: string; status: string }[];
  assignments: number;
  attempts: number;
};

export async function getTestVersionInfo(testId: string): Promise<TestVersionInfo> {
  const [test, assignments, attempts] = await Promise.all([
    prisma.mockTest.findUnique({
      where: { id: testId },
      select: {
        versionOf: { select: { id: true, title: true, isPublished: true } },
        versions: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, isPublished: true, createdAt: true } },
        fullMockReadingUses: { select: { fullMockTest: { select: { id: true, title: true, status: true } } } },
        fullMockListeningUses: { select: { fullMockTest: { select: { id: true, title: true, status: true } } } },
      },
    }),
    prisma.assignment.count({ where: { mockTestId: testId } }),
    prisma.result.count({ where: { mockTestId: testId } }),
  ]);
  if (!test) throw new Error("Test not found.");
  const mocks = new Map<string, { id: string; title: string; status: string }>();
  for (const use of [...test.fullMockReadingUses, ...test.fullMockListeningUses]) mocks.set(use.fullMockTest.id, use.fullMockTest);
  return { versionOf: test.versionOf, newerVersions: test.versions, fullMocks: [...mocks.values()], assignments, attempts };
}
