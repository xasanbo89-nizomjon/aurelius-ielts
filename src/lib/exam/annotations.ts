import type { HighlightColor } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { HIGHLIGHT_MAX_OFFSET, HIGHLIGHT_MAX_TEXT_LENGTH, QUESTION_REGION_PART_PATTERN } from "@/lib/exam/text-highlight";
import { NOTE_MAX_LENGTH, cleanNote } from "@/lib/exam/highlight-notes";
import { isHighlightColor } from "@/lib/exam/highlight-colors";

/** One attempt never needs more than this; it only stops a runaway client from filling the table. */
const MAX_HIGHLIGHTS_PER_ATTEMPT = 800;

function assertValidRange(text: string, startOffset: number, endOffset: number) {
  const valid =
    Number.isInteger(startOffset) &&
    Number.isInteger(endOffset) &&
    startOffset >= 0 &&
    endOffset > startOffset &&
    endOffset <= HIGHLIGHT_MAX_OFFSET &&
    text.length > 0 &&
    text.length <= HIGHLIGHT_MAX_TEXT_LENGTH;
  if (!valid) throw new Error("That highlight isn't valid.");
}

/** Verifies the passage belongs to the same test as the attempt before writing. */
async function assertOwnsPassage(resultId: string, studentId: string, passageId: string) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { mockTestId: true },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  const passage = await prisma.passage.findFirst({
    where: { id: passageId, mockTestId: result.mockTestId },
    select: { id: true },
  });
  if (!passage) throw new Error("Passage does not belong to this attempt.");
}

export async function addHighlight(
  resultId: string,
  studentId: string,
  input: { passageId: string; text: string; startOffset: number; endOffset: number; color?: HighlightColor }
) {
  assertValidRange(input.text, input.startOffset, input.endOffset);
  await assertOwnsPassage(resultId, studentId, input.passageId);

  return prisma.highlight.create({
    data: {
      resultId,
      passageId: input.passageId,
      text: input.text,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      color: input.color ?? "YELLOW",
    },
  });
}

/**
 * Phase D — a highlight inside the question panel. `part` says which string of
 * the question the offsets are measured in ("prompt", "choice:<id>", …); it is
 * only ever an id-shaped token, validated here, never free text.
 */
export async function addQuestionHighlight(
  resultId: string,
  studentId: string,
  input: { questionId: string; part: string; text: string; startOffset: number; endOffset: number }
) {
  assertValidRange(input.text, input.startOffset, input.endOffset);
  if (input.text.length !== input.endOffset - input.startOffset) throw new Error("That highlight isn't valid.");
  if (!QUESTION_REGION_PART_PATTERN.test(input.part)) throw new Error("That highlight isn't valid.");

  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { mockTestId: true },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  const question = await prisma.question.findFirst({ where: { id: input.questionId, mockTestId: result.mockTestId }, select: { id: true } });
  if (!question) throw new Error("Question does not belong to this attempt.");

  const existing = await prisma.questionHighlight.count({ where: { resultId } });
  if (existing >= MAX_HIGHLIGHTS_PER_ATTEMPT) throw new Error("You've reached the highlight limit for this test.");

  return prisma.questionHighlight.create({
    data: { resultId, questionId: input.questionId, region: input.part, text: input.text, startOffset: input.startOffset, endOffset: input.endOffset },
  });
}

export async function removeQuestionHighlight(resultId: string, studentId: string, highlightId: string) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { id: true },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  await prisma.questionHighlight.deleteMany({ where: { id: highlightId, resultId } });
}

export type HighlightChange = {
  /** New highlights to store, in order — the result lists their ids in the same order. A highlight may carry its note (Phase H). */
  adds: (
    | { kind: "passage"; passageId: string; text: string; startOffset: number; endOffset: number; note?: string | null; color?: HighlightColor }
    | { kind: "question"; questionId: string; part: string; text: string; startOffset: number; endOffset: number; note?: string | null; color?: HighlightColor }
  )[];
  removePassageIds: string[];
  removeQuestionIds: string[];
  /** Phase H — set (or clear, with null) the note of highlights that already exist. */
  notes?: { kind: "passage" | "question"; id: string; note: string | null }[];
};

const MAX_ADDS_PER_CHANGE = 12;
const MAX_REMOVES_PER_CHANGE = 40;
const MAX_NOTE_UPDATES_PER_CHANGE = 12;

/**
 * Phase D — ONE highlighting action (highlight, merge, clear, remove) as ONE
 * atomic write. A merge is "store the combined highlight and delete the two it
 * replaces"; done as three separate calls, a failure of one of them used to
 * leave a stale row behind (a lone "wide" under the merged "wide wetlands").
 * Here either everything in the change happens or nothing does.
 */
export async function applyHighlightChange(resultId: string, studentId: string, change: HighlightChange): Promise<string[]> {
  const noteUpdates = change.notes ?? [];
  if (
    change.adds.length > MAX_ADDS_PER_CHANGE ||
    change.removePassageIds.length + change.removeQuestionIds.length > MAX_REMOVES_PER_CHANGE ||
    noteUpdates.length > MAX_NOTE_UPDATES_PER_CHANGE
  ) {
    throw new Error("That highlight isn't valid.");
  }
  for (const update of noteUpdates) {
    if (typeof update.id !== "string" || !update.id || (update.note !== null && (typeof update.note !== "string" || update.note.length > NOTE_MAX_LENGTH))) throw new Error("That note isn't valid.");
  }
  for (const add of change.adds) {
    if (add.note != null && (typeof add.note !== "string" || add.note.length > NOTE_MAX_LENGTH)) throw new Error("That note isn't valid.");
    assertValidRange(add.text, add.startOffset, add.endOffset);
    if (add.color !== undefined && !isHighlightColor(add.color)) throw new Error("That highlight colour isn't valid.");
    if (add.kind === "question") {
      if (add.text.length !== add.endOffset - add.startOffset || !QUESTION_REGION_PART_PATTERN.test(add.part)) throw new Error("That highlight isn't valid.");
    }
  }

  const passageIds = [...new Set(change.adds.flatMap((add) => (add.kind === "passage" ? [add.passageId] : [])))];
  const questionIds = [...new Set(change.adds.flatMap((add) => (add.kind === "question" ? [add.questionId] : [])))];
  const ownsAttempt = { some: { id: resultId, studentId, completedAt: null } };

  // Every check is independent of the others, so they run together (each database round-trip costs real time here, and
  // highlights are written one after another — this is on the path of every highlight the student makes).
  const [attempt, passageMatches, questionMatches, existing] = await Promise.all([
    prisma.result.findFirst({ where: { id: resultId, studentId, completedAt: null }, select: { id: true } }),
    passageIds.length ? prisma.passage.count({ where: { id: { in: passageIds }, mockTest: { results: ownsAttempt } } }) : Promise.resolve(0),
    questionIds.length ? prisma.question.count({ where: { id: { in: questionIds }, mockTest: { results: ownsAttempt } } }) : Promise.resolve(0),
    change.adds.length > 0 ? Promise.all([prisma.highlight.count({ where: { resultId } }), prisma.questionHighlight.count({ where: { resultId } })]) : Promise.resolve([0, 0]),
  ]);
  if (!attempt) throw new Error("Attempt not found or already submitted.");
  if (passageMatches !== passageIds.length || questionMatches !== questionIds.length) throw new Error("Highlight does not belong to this attempt.");
  if (existing[0] + existing[1] + change.adds.length > MAX_HIGHLIGHTS_PER_ATTEMPT) throw new Error("You've reached the highlight limit for this test.");

  // One batched transaction: the new rows and the deletions go to the database together, in a single round-trip.
  const writes = [
    ...change.adds.map((add) =>
      add.kind === "passage"
        ? prisma.highlight.create({ data: { resultId, passageId: add.passageId, text: add.text, startOffset: add.startOffset, endOffset: add.endOffset, color: add.color ?? "YELLOW", note: cleanNote(add.note) }, select: { id: true } })
        : prisma.questionHighlight.create({ data: { resultId, questionId: add.questionId, region: add.part, text: add.text, startOffset: add.startOffset, endOffset: add.endOffset, color: add.color ?? "YELLOW", note: cleanNote(add.note) }, select: { id: true } })
    ),
    ...(change.removePassageIds.length ? [prisma.highlight.deleteMany({ where: { id: { in: change.removePassageIds }, resultId } })] : []),
    ...(change.removeQuestionIds.length ? [prisma.questionHighlight.deleteMany({ where: { id: { in: change.removeQuestionIds }, resultId } })] : []),
    // Phase H — notes on highlights that already exist (scoped to this attempt, so another student's row can never be touched).
    ...noteUpdates.map((update) =>
      update.kind === "passage"
        ? prisma.highlight.updateMany({ where: { id: update.id, resultId }, data: { note: cleanNote(update.note) } })
        : prisma.questionHighlight.updateMany({ where: { id: update.id, resultId }, data: { note: cleanNote(update.note) } })
    ),
  ];
  if (writes.length === 0) return [];
  const outcome = await prisma.$transaction(writes);
  return outcome.slice(0, change.adds.length).map((row) => (row as { id: string }).id);
}

/** Never throws: if the highlights table isn't there yet the exam still opens, just without question highlights. */
export async function listQuestionHighlights(resultId: string) {
  try {
    return await prisma.questionHighlight.findMany({
      where: { resultId },
      orderBy: { createdAt: "asc" },
      select: { id: true, questionId: true, region: true, text: true, startOffset: true, endOffset: true, color: true, note: true },
    });
  } catch (error) {
    console.error("[exam] could not load question highlights", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function removeHighlight(resultId: string, studentId: string, highlightId: string) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { id: true },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  await prisma.highlight.deleteMany({ where: { id: highlightId, resultId } });
}

export async function saveNote(
  resultId: string,
  studentId: string,
  input: { noteId?: string; passageId?: string; content: string }
) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { id: true },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  if (input.passageId) {
    await assertOwnsPassage(resultId, studentId, input.passageId);
  }

  if (input.noteId) {
    const updated = await prisma.note.updateMany({
      where: { id: input.noteId, resultId },
      data: { content: input.content },
    });
    if (updated.count > 0) return;
  }

  await prisma.note.create({
    data: { resultId, passageId: input.passageId, content: input.content },
  });
}

export async function deleteNote(resultId: string, studentId: string, noteId: string) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { id: true },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  await prisma.note.deleteMany({ where: { id: noteId, resultId } });
}
