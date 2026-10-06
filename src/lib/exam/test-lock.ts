import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Phase L1 - the edit rule. What a student sees and is scored on (passages, recordings, questions, answer keys, groups) may only be changed while the test
 * is a DRAFT nobody has taken:
 *
 *   published                     -> locked. Unpublish it first (only possible while it has no attempts) or make a new version.
 *   has attempts (any Result)     -> locked for good: those results are only meaningful against the test they were taken on. Make a new version.
 *   inside a published Full Mock  -> locked: students reach it through that mock.
 *
 * Title, description and cover image are labels only and stay editable at any time.
 */
export class TestLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestLockedError";
  }
}

export type TestEditState = {
  editable: boolean;
  /** Why it is locked, written for the teacher (null when editable). */
  reason: string | null;
  isPublished: boolean;
  attempts: number;
  /** Titles of the published Full Mocks that include this test. */
  liveFullMocks: string[];
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function getTestEditState(testId: string): Promise<TestEditState> {
  const [test, attempts] = await Promise.all([
    prisma.mockTest.findUnique({
      where: { id: testId },
      select: {
        isPublished: true,
        packageFullMockTest: { select: { title: true, status: true } },
        fullMockReadingUses: { select: { fullMockTest: { select: { title: true, status: true } } } },
        fullMockListeningUses: { select: { fullMockTest: { select: { title: true, status: true } } } },
      },
    }),
    prisma.result.count({ where: { mockTestId: testId } }),
  ]);
  if (!test) throw new Error("Test not found.");

  const owners = [...test.fullMockReadingUses, ...test.fullMockListeningUses].map((use) => use.fullMockTest);
  if (test.packageFullMockTest) owners.push(test.packageFullMockTest);
  const liveFullMocks = [...new Set(owners.filter((mock) => mock.status === "PUBLISHED").map((mock) => mock.title))];

  let reason: string | null = null;
  if (attempts > 0) {
    reason = `${plural(attempts, "student attempt")} ${attempts === 1 ? "was" : "were"} taken on this test, so its questions and answers can no longer be changed. Create a new version to change them - the results stay on this one.`;
  } else if (test.isPublished) {
    reason = "This test is published. Unpublish it to edit it (no student has taken it yet), or create a new version.";
  } else if (liveFullMocks.length > 0) {
    reason = `This test is part of the published Full Mock ${liveFullMocks.map((title) => `"${title}"`).join(", ")}. Unpublish that mock first, or create a new version.`;
  }

  return { editable: reason === null, reason, isPublished: test.isPublished, attempts, liveFullMocks };
}

/** Throws a TestLockedError (with the reason in plain words) when the test's content may not be changed. */
export async function assertTestEditable(testId: string): Promise<void> {
  const state = await getTestEditState(testId);
  if (!state.editable) throw new TestLockedError(state.reason ?? "This test can't be edited.");
}

/** A test with attempts is never unpublished: it would hide results that students and teachers still look at. Archive it to retire it. */
export async function assertCanUnpublish(testId: string): Promise<void> {
  const attempts = await prisma.result.count({ where: { mockTestId: testId } });
  if (attempts > 0) {
    throw new TestLockedError(`${plural(attempts, "student attempt")} ${attempts === 1 ? "was" : "were"} taken on this test, so it can't be unpublished. Archive it to retire it, or create a new version to change it.`);
  }
}
