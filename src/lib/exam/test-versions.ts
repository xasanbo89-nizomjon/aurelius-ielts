import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { newRowId } from "@/lib/exam/row-ids";
import { remapEvidencePassages } from "@/lib/exam/answer-evidence-store";
import { authorScope, canManageTest, getTestActor } from "@/lib/exam/test-access";
import { OwnershipError, setArchived, setPublished } from "@/lib/exam/test-management";
import { versionNumbersFor } from "@/lib/exam/version-numbers";
import { setFullMockListeningTest, setFullMockReadingTest } from "@/lib/full-mock-tests";

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

/**
 * Phase L2 - a NEW VERSION keeps the title of the test it replaces (students must never see "(new version)"); it is told apart internally by `versionOfId`
 * and, to teachers, as "v2", "v3" ... (see versionNumbersFor). A DUPLICATE is a separate test, so its title says so.
 */
const TITLE_SUFFIX: Record<CopyMode, string> = { version: "", duplicate: " (copy)" };

const newId = newRowId;

const json = (value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull => (value === null || value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue));

export async function copyTest(testId: string, teacherId: string, mode: CopyMode): Promise<{ id: string; title: string }> {
  const actor = await getTestActor(teacherId);
  const source = await prisma.mockTest.findUnique({
    where: { id: testId },
    include: {
      passages: { orderBy: { orderIndex: "asc" }, include: { attachments: { orderBy: { orderIndex: "asc" } }, questionGroups: { orderBy: { orderIndex: "asc" } } } },
      // Phase M2 - the stored explanations travel with the questions they were written for.
      questions: { orderBy: { orderIndex: "asc" }, include: { explanation: true } },
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

  const questionIds = new Map(source.questions.map((question) => [question.id, newId()]));
  const questionRows: Prisma.QuestionCreateManyInput[] = source.questions.map((question) => ({
    id: questionIds.get(question.id) as string,
    mockTestId: newTestId,
    passageId: question.passageId ? (passageIds.get(question.passageId) ?? null) : null,
    questionGroupId: question.questionGroupId ? (groupIds.get(question.questionGroupId) ?? null) : null,
    type: question.type,
    prompt: question.prompt,
    options: json(question.options),
    correctAnswer: json(question.correctAnswer),
    orderIndex: question.orderIndex,
    points: question.points,
    // Phase M - the copy has the same passage text, so where the answers are carries over (the passages have new ids).
    evidence: json(remapEvidencePassages(question.evidence, passageIds)),
  }));

  // Phase M2 - an explanation is copied as it is (status and the hash of what it was written for included): the copy starts out identical, so it is shown for
  // exactly as long as the question and its answer stay the same - edit either in the new version and the old explanation is hidden until it is written again.
  const explanationRows: Prisma.QuestionExplanationCreateManyInput[] = source.questions.flatMap((question) =>
    question.explanation
      ? [
          {
            questionId: questionIds.get(question.id) as string,
            explainText: question.explanation.explainText,
            trapText: question.explanation.trapText,
            fixText: question.explanation.fixText,
            status: question.explanation.status,
            sourceHash: question.explanation.sourceHash,
            source: question.explanation.source,
            model: question.explanation.model,
            generatedAt: question.explanation.generatedAt,
            approvedAt: question.explanation.approvedAt,
            approvedById: question.explanation.approvedById,
          },
        ]
      : []
  );

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
        // Phase Q - a copy is the same kind of paper (null stays null: a Full IELTS test).
        testFormat: source.testFormat,
        // Phase O - and has the same answer to "Show results to students?" (a test made before Phase O has none: the teacher chooses before the copy is published).
        showResultsToStudent: source.showResultsToStudent,
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
    prisma.questionExplanation.createMany({ data: explanationRows }),
  ]);

  return { id: newTestId, title };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Newest version
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type NewestVersion = { id: string; title: string; versionNumber: number };

/**
 * The newest PUBLISHED, not archived version made from a test (the test itself does not count): looked for among everything that descends from it,
 * limited to tests this teacher may manage. Null when the test has no newer published version.
 */
export async function newestPublishedVersion(testId: string, teacherId: string): Promise<NewestVersion | null> {
  return (await newestPublishedVersions([testId], teacherId)).get(testId) ?? null;
}

/** Same as newestPublishedVersion for several tests at once (a page lists many): the descendants of all of them are read together, level by level. */
export async function newestPublishedVersions(testIds: readonly string[], teacherId: string): Promise<Map<string, NewestVersion>> {
  const roots = [...new Set(testIds)];
  const newest = new Map<string, NewestVersion>();
  if (roots.length === 0) return newest;
  const scope = await authorScope(teacherId);
  const rootOf = new Map<string, string>(roots.map((id) => [id, id]));
  const live = new Map<string, { id: string; title: string; createdAt: Date }>();
  let frontier = roots;
  for (let round = 0; round < 20 && frontier.length > 0; round++) {
    const children = await prisma.mockTest.findMany({ where: { versionOfId: { in: frontier }, ...scope }, select: { id: true, title: true, createdAt: true, isPublished: true, isArchived: true, versionOfId: true } });
    const next: string[] = [];
    for (const child of children) {
      const root = rootOf.get(child.versionOfId ?? "");
      if (!root || rootOf.has(child.id)) continue;
      rootOf.set(child.id, root);
      next.push(child.id);
      const best = live.get(root);
      if (child.isPublished && !child.isArchived && (!best || child.createdAt > best.createdAt)) live.set(root, child);
    }
    frontier = next;
  }
  const numbers = await versionNumbersFor([...live.values()].map((test) => test.id));
  for (const [root, test] of live) newest.set(root, { id: test.id, title: test.title, versionNumber: numbers.get(test.id) ?? 2 });
  return newest;
}

/** What a Full Mock's Reading / Listening section holds, and whether a newer published version of it is waiting (the "Use v2" button). */
export type FullMockVersionHint = {
  current: { id: string; title: string; versionNumber: number; isPublished: boolean; isArchived: boolean };
  newest: NewestVersion | null;
};

export async function getFullMockVersionHints(fullMockTestId: string, teacherId: string): Promise<{ reading: FullMockVersionHint | null; listening: FullMockVersionHint | null }> {
  const [reading, listening] = await Promise.all([
    prisma.fullMockReadingSection.findFirst({ where: { fullMockTestId }, select: { mockTest: { select: { id: true, title: true, isPublished: true, isArchived: true } } } }),
    prisma.fullMockListeningSection.findFirst({ where: { fullMockTestId }, select: { mockTest: { select: { id: true, title: true, isPublished: true, isArchived: true } } } }),
  ]);
  const held = [reading?.mockTest, listening?.mockTest].filter((test): test is NonNullable<typeof test> => Boolean(test));
  const [numbers, newest] = await Promise.all([versionNumbersFor(held.map((test) => test.id)), newestPublishedVersions(held.map((test) => test.id), teacherId)]);
  const hint = (test: (typeof held)[number] | undefined): FullMockVersionHint | null => (test ? { current: { ...test, versionNumber: numbers.get(test.id) ?? 1 }, newest: newest.get(test.id) ?? null } : null);
  return { reading: hint(reading?.mockTest), listening: hint(listening?.mockTest) };
}

/** What depends on a test and what came from it: shown on the test's page so nobody switches a Full Mock by accident. */
export type TestVersionInfo = {
  versionNumber: number;
  versionOf: { id: string; title: string; isPublished: boolean; isArchived: boolean; versionNumber: number } | null;
  newerVersions: { id: string; title: string; isPublished: boolean; isArchived: boolean; createdAt: Date; versionNumber: number }[];
  fullMocks: { id: string; title: string; status: string }[];
  assignments: number;
  attempts: number;
};

export async function getTestVersionInfo(testId: string): Promise<TestVersionInfo> {
  const [test, assignments, attempts] = await Promise.all([
    prisma.mockTest.findUnique({
      where: { id: testId },
      select: {
        versionOf: { select: { id: true, title: true, isPublished: true, isArchived: true } },
        versions: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, isPublished: true, isArchived: true, createdAt: true } },
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
  const numbers = await versionNumbersFor([testId, ...(test.versionOf ? [test.versionOf.id] : []), ...test.versions.map((v) => v.id)]);
  return {
    versionNumber: numbers.get(testId) ?? 1,
    versionOf: test.versionOf ? { ...test.versionOf, versionNumber: numbers.get(test.versionOf.id) ?? 1 } : null,
    newerVersions: test.versions.map((version) => ({ ...version, versionNumber: numbers.get(version.id) ?? 2 })),
    fullMocks: [...mocks.values()],
    assignments,
    attempts,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// "Use newest version": the explicit switch (nothing ever switches by itself)
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/** The Full Mock's Reading or Listening section moves to the newest published version of the test it holds now. */
export async function switchFullMockToNewestVersion(fullMockTestId: string, teacherId: string, skill: "READING" | "LISTENING"): Promise<NewestVersion> {
  const section =
    skill === "READING"
      ? await prisma.fullMockReadingSection.findFirst({ where: { fullMockTestId }, select: { mockTestId: true } })
      : await prisma.fullMockListeningSection.findFirst({ where: { fullMockTestId }, select: { mockTestId: true } });
  if (!section) throw new Error(`This Full Mock has no ${skill.toLowerCase()} test yet.`);
  const newest = await newestPublishedVersion(section.mockTestId, teacherId);
  if (!newest) throw new Error("There is no newer published version of this test.");
  if (skill === "READING") await setFullMockReadingTest(fullMockTestId, teacherId, newest.id);
  else await setFullMockListeningTest(fullMockTestId, teacherId, newest.id);
  return newest;
}

/** An assignment moves to the newest published version of its test (what the student already did stays on the version it was done on). */
export async function switchAssignmentToNewestVersion(assignmentId: string, teacherId: string): Promise<NewestVersion> {
  const actor = await getTestActor(teacherId);
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { id: true, teacherId: true, mockTestId: true } });
  if (!assignment || (!actor.isRootTeacher && assignment.teacherId !== teacherId)) throw new OwnershipError("You don't have access to this assignment.");
  if (!assignment.mockTestId) throw new Error("This assignment has no test.");
  const newest = await newestPublishedVersion(assignment.mockTestId, teacherId);
  if (!newest) throw new Error("There is no newer published version of this test.");
  await prisma.assignment.update({ where: { id: assignmentId }, data: { mockTestId: newest.id } });
  return newest;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Publishing a new version
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/** The version this test replaces, when it is still live - the one the publish dialog offers to archive - and what still depends on it. */
export type PreviousLiveVersion = {
  id: string;
  title: string;
  versionNumber: number;
  /** Full Mocks whose Reading / Listening section holds it (archiving moves them to the new version). */
  fullMocks: { id: string; title: string; skill: "READING" | "LISTENING" }[];
  /** Assignments not yet handed in that point at it (moved too; finished ones keep pointing at it, so what a student did stays where it was done). */
  openAssignments: number;
  /** Students in the middle of sitting it: while any exist it cannot be archived (an archived test cannot be resumed). */
  inProgress: number;
};

export async function previousLiveVersion(testId: string, teacherId: string): Promise<PreviousLiveVersion | null> {
  const test = await prisma.mockTest.findUnique({ where: { id: testId }, select: { versionOfId: true } });
  if (!test?.versionOfId) return null;
  const actor = await getTestActor(teacherId);
  const previous = await prisma.mockTest.findUnique({
    where: { id: test.versionOfId },
    select: {
      id: true,
      title: true,
      isPublished: true,
      isArchived: true,
      createdById: true,
      fullMockReadingUses: { select: { fullMockTest: { select: { id: true, title: true } } } },
      fullMockListeningUses: { select: { fullMockTest: { select: { id: true, title: true } } } },
    },
  });
  if (!previous || !previous.isPublished || previous.isArchived || !canManageTest(actor, previous)) return null;
  const [numbers, openAssignments, inProgress] = await Promise.all([
    versionNumbersFor([previous.id]),
    prisma.assignment.count({ where: { mockTestId: previous.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
    prisma.result.count({ where: { mockTestId: previous.id, completedAt: null } }),
  ]);
  return {
    id: previous.id,
    title: previous.title,
    versionNumber: numbers.get(previous.id) ?? 1,
    fullMocks: [
      ...previous.fullMockReadingUses.map((use) => ({ ...use.fullMockTest, skill: "READING" as const })),
      ...previous.fullMockListeningUses.map((use) => ({ ...use.fullMockTest, skill: "LISTENING" as const })),
    ],
    openAssignments,
    inProgress,
  };
}

export type PublishVersionOutcome = {
  archived: { id: string; title: string; versionNumber: number } | null;
  /** How many Full Mocks and assignments were moved from the old version to this one. */
  switched: { fullMocks: number; assignments: number };
  /** Why the previous version was left live although the teacher asked to archive it. */
  notArchivedBecause: string | null;
};

/**
 * Publishes a test; when it is a new version and `archivePrevious` is set, the version it replaces is archived in the same step (hidden from students, its
 * attempts and results kept). An archived test cannot be started or resumed, so before archiving, the Full Mocks and open assignments that still use the old
 * version are moved to this one - the dialog says so in plain words - and nothing is archived while a student is in the middle of it or while anything that
 * uses it could not be moved. The publish itself always goes ahead.
 */
export async function publishVersion(testId: string, teacherId: string, options: { archivePrevious?: boolean } = {}): Promise<PublishVersionOutcome> {
  const previous = options.archivePrevious ? await previousLiveVersion(testId, teacherId) : null;
  await setPublished(testId, teacherId, true);
  const outcome: PublishVersionOutcome = { archived: null, switched: { fullMocks: 0, assignments: 0 }, notArchivedBecause: null };
  if (!previous) return outcome;

  if (previous.inProgress > 0) {
    outcome.notArchivedBecause = `${previous.inProgress} student${previous.inProgress === 1 ? " is" : "s are"} in the middle of the previous version, so it stays published until they finish. Archive it later from the Tests list.`;
    return outcome;
  }

  const actor = await getTestActor(teacherId);
  try {
    for (const mock of previous.fullMocks) {
      if (mock.skill === "READING") await setFullMockReadingTest(mock.id, teacherId, testId);
      else await setFullMockListeningTest(mock.id, teacherId, testId);
      outcome.switched.fullMocks++;
    }
  } catch (error) {
    outcome.notArchivedBecause = `The previous version was not archived: ${error instanceof Error ? error.message : "a Full Mock that uses it could not be switched"}. Switch it by hand, then archive.`;
    return outcome;
  }
  const moved = await prisma.assignment.updateMany({
    where: { mockTestId: previous.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] }, ...(actor.isRootTeacher ? {} : { teacherId }) },
    data: { mockTestId: testId },
  });
  outcome.switched.assignments = moved.count;

  await setArchived(previous.id, teacherId, true);
  outcome.archived = { id: previous.id, title: previous.title, versionNumber: previous.versionNumber };
  return outcome;
}
