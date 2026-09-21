import { prisma } from "@/lib/prisma";

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
  input: { passageId: string; text: string; startOffset: number; endOffset: number }
) {
  await assertOwnsPassage(resultId, studentId, input.passageId);

  return prisma.highlight.create({
    data: {
      resultId,
      passageId: input.passageId,
      text: input.text,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
    },
  });
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
