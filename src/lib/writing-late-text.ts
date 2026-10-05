import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { countWords } from "@/lib/writing/word-count";

// ---------------------------------------------------------------------------
// Phase K - "late text".
//
// A Writing paper whose time ran out while the student was offline is handed in by the server with the last draft that was SAVED. The student's
// browser may still hold words that never reached the server. When the connection returns the browser uploads them here; they are kept next to
// the submission - with the moment the browser last held them - and shown to the teacher as "Late text available (not part of the submission)".
// The submission's own text, word count and band are never changed by any of this.
// ---------------------------------------------------------------------------

/** A late text can be a whole essay: well above any real one, small enough that an upload cannot bloat the table. */
export const MAX_LATE_TEXT_CHARS = 20_000;
/** At most this many different late texts are kept per submission (a retry of the same words is stored once, by hash). */
const MAX_LATE_TEXTS_PER_SUBMISSION = 3;

export type LateTextOutcome =
  /** Stored now. */
  | "stored"
  /** The same words were stored before (a retry). */
  | "already-stored"
  /** Nothing to keep: the words are the submission's own (or an older part of it), empty, too long or over the limit. */
  | "same-as-submission"
  | "empty"
  | "rejected"
  /** The essay is still a draft (the student is still writing): the browser's copy stays where it is. */
  | "not-submitted"
  | "not-found";

/** Outcomes after which the browser's copy has nothing more to do and can be deleted. */
export const LATE_TEXT_SETTLED: readonly LateTextOutcome[] = ["stored", "already-stored", "same-as-submission", "empty", "rejected"];

const hashOf = (content: string) => createHash("sha256").update(content.trim()).digest("hex");

/**
 * Keeps `content` as late text of the student's submission `submissionId`. `clientSavedAt` is when the browser last held the words (its own clock,
 * informational only: never later than now).
 */
export async function recordLateText(studentId: string, input: { submissionId: string; content: string; clientSavedAt?: Date | number | null }): Promise<LateTextOutcome> {
  const submission = await prisma.writingSubmission.findFirst({ where: { id: input.submissionId, studentId }, select: { id: true, status: true, content: true } });
  if (!submission) return "not-found";
  if (submission.status === "DRAFT") return "not-submitted";

  const content = input.content.trim();
  if (content.length === 0) return "empty";
  if (content.length > MAX_LATE_TEXT_CHARS) return "rejected";
  // The submission already holds these words, or the browser's text is just an earlier stage of it.
  const submitted = submission.content.trim();
  if (content === submitted || submitted.startsWith(content)) return "same-as-submission";

  const contentHash = hashOf(content);
  const existing = await prisma.writingLateText.findUnique({ where: { submissionId_contentHash: { submissionId: submission.id, contentHash } }, select: { id: true } });
  if (existing) return "already-stored";
  if ((await prisma.writingLateText.count({ where: { submissionId: submission.id } })) >= MAX_LATE_TEXTS_PER_SUBMISSION) return "rejected";

  const now = Date.now();
  const at = typeof input.clientSavedAt === "number" ? input.clientSavedAt : input.clientSavedAt instanceof Date ? input.clientSavedAt.getTime() : now;
  const clientSavedAt = new Date(Number.isFinite(at) && at > 0 && at <= now ? at : now);

  try {
    await prisma.writingLateText.create({ data: { submissionId: submission.id, content, contentHash, wordCount: countWords(content), clientSavedAt } });
  } catch (error) {
    // Two uploads of the same words at once: the other one stored it.
    if ((error as { code?: string }).code === "P2002") return "already-stored";
    throw error;
  }
  return "stored";
}

/**
 * The browser says it holds `content` for `taskId` of the sitting `attemptKey` ("fm:<full mock attempt>" or "sw:<writing sitting>", the keys the
 * Writing screen stores its copy under). Finds the student's submission for it and keeps the words as late text.
 */
export async function recordLateTextFromBrowser(studentId: string, input: { attemptKey: string; taskId: string; content: string; clientSavedAt?: number | null }): Promise<LateTextOutcome> {
  const [kind, id] = input.attemptKey.split(":");
  if (!id || (kind !== "fm" && kind !== "sw")) return "not-found";

  let submissionId: string | null = null;
  if (kind === "sw") {
    // A sitting on its own IS its draft: the key names the submission.
    const own = await prisma.writingSubmission.findFirst({ where: { id, studentId, taskId: input.taskId }, select: { id: true } });
    submissionId = own?.id ?? null;
  } else {
    const attempt = await prisma.fullMockAttempt.findFirst({ where: { id, studentId }, select: { startedAt: true, sectionResults: { where: { section: "WRITING" }, select: { writingSubmission: { select: { id: true, taskId: true } } } } } });
    if (!attempt) return "not-found";
    submissionId = attempt.sectionResults.map((link) => link.writingSubmission).find((sub) => sub?.taskId === input.taskId)?.id ?? null;
    if (!submissionId) {
      // Handed in but not linked to the sitting yet (the next visit links it): the student's essay for this task from this sitting.
      const handedIn = await prisma.writingSubmission.findFirst({
        where: { studentId, taskId: input.taskId, status: { not: "DRAFT" }, OR: [{ submittedAt: { gte: attempt.startedAt } }, { submittedAt: null, createdAt: { gte: attempt.startedAt } }] },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      submissionId = handedIn?.id ?? null;
    }
  }
  if (!submissionId) return "not-submitted";
  return recordLateText(studentId, { submissionId, content: input.content, clientSavedAt: input.clientSavedAt });
}

export type LateTextForTeacher = { id: string; content: string; wordCount: number; clientSavedAt: Date; receivedAt: Date };

/** The late texts of a submission, oldest first (the teacher's review page). */
export async function listLateTexts(submissionId: string): Promise<LateTextForTeacher[]> {
  return prisma.writingLateText.findMany({ where: { submissionId }, orderBy: { receivedAt: "asc" }, select: { id: true, content: true, wordCount: true, clientSavedAt: true, receivedAt: true } });
}
