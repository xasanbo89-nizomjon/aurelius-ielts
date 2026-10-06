import "server-only";
import { authorScope } from "@/lib/exam/test-access";
import { randomInt } from "crypto";

import { prisma } from "@/lib/prisma";
import { bandForSection, overallBandFromSections, overallBandLabel, requiredSectionsFor, writingProgressLabel } from "@/lib/full-mock-band-composition";
import { fullMockTimeUsed, type FullMockTimeUsed } from "@/lib/exam/section-deadline";
import { settleOverdueAttempts } from "@/lib/full-mock-attempts";

export class OwnershipError extends Error {
  constructor(message = "You don't have access to this resource.") {
    super(message);
    this.name = "OwnershipError";
  }
}

// ---------------------------------------------------------------------------
// Code generation — ambiguity-free alphabet (no 0/O/1/I), same reasoning as
// Speaking Task codes (src/lib/speaking.ts): these are read off a screen and
// typed by hand, often under exam-room time pressure, so visual ambiguity
// is a real cost a promo code (usually copy-pasted) doesn't pay.
// ---------------------------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_PREFIX = "MOCK-";
const MAX_GENERATION_ATTEMPTS = 10;
const MAX_BULK_COUNT = 200;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${CODE_PREFIX}${code}`;
}

async function generateUniqueMockAccessCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const code = randomCode();
    const existing = await prisma.mockAccessCode.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique access code. Try again.");
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

async function assertOwnsFullMockTest(fullMockTestId: string, teacherId: string) {
  const test = await prisma.fullMockTest.findFirst({ where: { id: fullMockTestId, ...(await authorScope(teacherId)) } });
  if (!test) throw new OwnershipError("You don't have access to this full mock test.");
  return test;
}

// ---------------------------------------------------------------------------
// Create (Goal 1/3) — single, optionally pre-assigned to one student, or bulk/unassigned.
// ---------------------------------------------------------------------------

const MAX_REDEMPTIONS_LIMIT = 10_000;

/**
 * Phase A — how many different students may redeem a code: a positive number,
 * or null for unlimited. A code pre-assigned to one student is always 1 (it
 * can only ever be that student's), and an unspecified setting keeps the
 * original single-student behavior.
 */
function resolveMaxRedemptions(requested: number | null | undefined, assignedStudentId?: string | null): number | null {
  if (assignedStudentId) return 1;
  if (requested === undefined) return 1;
  if (requested === null) return null;
  if (!Number.isInteger(requested) || requested < 1) throw new Error("Uses must be a whole number of at least 1.");
  return Math.min(requested, MAX_REDEMPTIONS_LIMIT);
}

export async function createMockAccessCode(
  fullMockTestId: string,
  teacherId: string,
  input: { assignedStudentId?: string | null; expiresAt?: Date | null; maxRedemptions?: number | null }
) {
  await assertOwnsFullMockTest(fullMockTestId, teacherId);

  if (input.assignedStudentId) {
    const student = await prisma.studentProfile.findFirst({ where: { id: input.assignedStudentId, teacherId } });
    if (!student) throw new Error("That student isn't one of yours.");
  }

  const code = await generateUniqueMockAccessCode();
  return prisma.mockAccessCode.create({
    data: {
      code,
      fullMockTestId,
      createdById: teacherId,
      assignedStudentId: input.assignedStudentId || null,
      expiresAt: input.expiresAt || null,
      maxRedemptions: resolveMaxRedemptions(input.maxRedemptions, input.assignedStudentId),
    },
  });
}

/** Bulk-generates `count` unassigned codes in one batch — each is claimed by whichever student(s) redeem it first, up to its maxRedemptions (see redeemMockAccessCode). Capped at MAX_BULK_COUNT per call to keep this a deliberate, bounded action. */
export async function createBulkMockAccessCodes(
  fullMockTestId: string,
  teacherId: string,
  input: { count: number; expiresAt?: Date | null; maxRedemptions?: number | null }
) {
  await assertOwnsFullMockTest(fullMockTestId, teacherId);
  const count = Math.min(Math.max(1, Math.trunc(input.count)), MAX_BULK_COUNT);
  const maxRedemptions = resolveMaxRedemptions(input.maxRedemptions);

  const generated = new Set<string>();
  for (let i = 0; i < count; i++) {
    let code = "";
    let attempts = 0;
    do {
      code = randomCode();
      attempts++;
      if (attempts > MAX_GENERATION_ATTEMPTS * 2) {
        throw new Error("Could not generate enough unique access codes — try a smaller batch.");
      }
      // Checked against both this batch's own in-flight codes (not yet
      // persisted) and the database, since a DB-only check can't see a
      // sibling code generated earlier in this same loop.
    } while (generated.has(code) || (await prisma.mockAccessCode.findUnique({ where: { code }, select: { id: true } })));
    generated.add(code);
  }

  await prisma.mockAccessCode.createMany({
    data: [...generated].map((code) => ({ code, fullMockTestId, createdById: teacherId, expiresAt: input.expiresAt || null, maxRedemptions })),
  });

  return prisma.mockAccessCode.findMany({ where: { code: { in: [...generated] } }, orderBy: { code: "asc" } });
}

/** Phase A — change how many students may use an existing code. Can't go below the number who already have (that would orphan real attempts), and an assigned code stays single-student. */
export async function updateMockAccessCodeMaxRedemptions(accessCodeId: string, teacherId: string, maxRedemptions: number | null): Promise<void> {
  const row = await prisma.mockAccessCode.findFirst({ where: { id: accessCodeId, ...(await authorScope(teacherId)) } });
  if (!row) throw new Error("Access code not found.");
  const next = resolveMaxRedemptions(maxRedemptions, row.assignedStudentId);
  if (next !== null && next < row.redemptionCount) {
    throw new Error(
      `${row.redemptionCount} student${row.redemptionCount === 1 ? " has" : "s have"} already used this code — it can't be limited to fewer than that.`
    );
  }
  await prisma.mockAccessCode.update({ where: { id: accessCodeId }, data: { maxRedemptions: next } });
}

// ---------------------------------------------------------------------------
// Management (Goal 8) — mirrors promo-codes.ts's isActive/expiresAt/delete-vs-disable convention exactly.
// ---------------------------------------------------------------------------

export async function setMockAccessCodeActive(accessCodeId: string, teacherId: string, isActive: boolean): Promise<void> {
  const result = await prisma.mockAccessCode.updateMany({ where: { id: accessCodeId, ...(await authorScope(teacherId)) }, data: { isActive } });
  if (result.count === 0) throw new Error("Access code not found.");
}

export async function updateMockAccessCodeExpiry(accessCodeId: string, teacherId: string, expiresAt: Date | null): Promise<void> {
  const result = await prisma.mockAccessCode.updateMany({ where: { id: accessCodeId, ...(await authorScope(teacherId)) }, data: { expiresAt } });
  if (result.count === 0) throw new Error("Access code not found.");
}

/** Blocked once a code has been redeemed — deleting it would destroy the trail linking a real attempt back to how it started. Deactivate it instead. */
export async function deleteMockAccessCode(accessCodeId: string, teacherId: string): Promise<void> {
  const code = await prisma.mockAccessCode.findFirst({ where: { id: accessCodeId, ...(await authorScope(teacherId)) } });
  if (!code) throw new Error("Access code not found.");
  if (code.redeemedByStudentId || code.redemptionCount > 0) {
    throw new Error("This code has already been used and can't be deleted — deactivate it instead.");
  }
  await prisma.mockAccessCode.delete({ where: { id: accessCodeId } });
}

export async function listMockAccessCodesForFullMockTest(fullMockTestId: string, teacherId: string) {
  await assertOwnsFullMockTest(fullMockTestId, teacherId);
  return prisma.mockAccessCode.findMany({
    where: { fullMockTestId },
    orderBy: { createdAt: "desc" },
    include: {
      assignedStudent: { select: { user: { select: { name: true, email: true } } } },
      redeemedByStudent: { select: { user: { select: { name: true, email: true } } } },
    },
  });
}

export type MockAccessCodeRow = Awaited<ReturnType<typeof listMockAccessCodesForFullMockTest>>[number];

// ---------------------------------------------------------------------------
// Student redemption (Goal 2) — the security-critical gate.
// ---------------------------------------------------------------------------

export type RedeemMockAccessCodeResult =
  | { ok: true; fullMockTestId: string }
  | { ok: false; reason: "NOT_FOUND" | "UNAVAILABLE" };

class CodeFullyUsedError extends Error {}
/** The same student's other request already redeemed the code — rolls this transaction back so the use counter isn't incremented twice. */
class AlreadyRedeemedError extends Error {}

/**
 * Deliberately returns only two outcomes, matching the spec's exact two
 * error strings — "Access code not found" for anything that isn't a valid,
 * reachable code for THIS student (wrong code, a code for a different mock,
 * assigned to someone else, already used up by other students — never
 * distinguished, so a student can never probe which codes exist or who they
 * belong to), and "no longer available" for a code that exists and is theirs
 * but is disabled, expired, or already fully sat (completed).
 *
 * Phase A — checks, in order: the code exists; it belongs to the mock the
 * student is on (when expectedFullMockTestId is given); it isn't assigned
 * to someone else; it still has a use left for a NEW student (or the student
 * already holds one of its uses); it's active; it isn't expired. A code can
 * be shared by up to maxRedemptions students (1 = the original
 * one-student-per-code behavior, null = unlimited); each student redeems it
 * once and keeps their own attempt.
 */
export async function redeemMockAccessCode(
  rawCode: string,
  studentId: string,
  options: { expectedFullMockTestId?: string } = {}
): Promise<RedeemMockAccessCodeResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "NOT_FOUND" };

  const row = await prisma.mockAccessCode.findUnique({
    where: { code },
    include: { redemptions: { where: { studentId }, select: { id: true } } },
  });
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  if (options.expectedFullMockTestId && row.fullMockTestId !== options.expectedFullMockTestId) return { ok: false, reason: "NOT_FOUND" };
  if (row.assignedStudentId && row.assignedStudentId !== studentId) return { ok: false, reason: "NOT_FOUND" };

  const alreadyMine = row.redemptions.length > 0;
  if (!alreadyMine && row.maxRedemptions !== null && row.redemptionCount >= row.maxRedemptions) return { ok: false, reason: "NOT_FOUND" };

  if (!row.isActive) return { ok: false, reason: "UNAVAILABLE" };
  if (row.expiresAt && row.expiresAt <= new Date()) return { ok: false, reason: "UNAVAILABLE" };

  if (alreadyMine) {
    // Already this student's own redeemed code — fine to re-enter (resume),
    // UNLESS their one sitting under it is done.
    const completedAttempt = await prisma.fullMockAttempt.findFirst({
      where: { accessCodeId: row.id, studentId, status: "COMPLETED" },
      select: { id: true },
    });
    if (completedAttempt) return { ok: false, reason: "UNAVAILABLE" };
    return { ok: true, fullMockTestId: row.fullMockTestId };
  }

  // First-time claim by this student — one transaction, and the use counter is
  // a guarded UPDATE so students racing on the last remaining use can't
  // both win it (same updateMany+count technique promo-codes.ts uses for its
  // usage-limit race). The (code, student) unique row makes a double-submit
  // by the same student harmless.
  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.mockAccessCode.updateMany({
        where: { id: row.id, ...(row.maxRedemptions !== null ? { redemptionCount: { lt: row.maxRedemptions } } : {}) },
        data: { redemptionCount: { increment: 1 } },
      });
      if (claim.count === 0) throw new CodeFullyUsedError();

      const created = await tx.mockAccessCodeRedemption.createMany({ data: [{ accessCodeId: row.id, studentId }], skipDuplicates: true });
      if (created.count === 0) throw new AlreadyRedeemedError();
      // Keeps "who first used it" populated for the teacher's table and for single-use codes' original semantics.
      await tx.mockAccessCode.updateMany({ where: { id: row.id, redeemedByStudentId: null }, data: { redeemedByStudentId: studentId, redeemedAt: new Date() } });
    });
  } catch (error) {
    if (error instanceof CodeFullyUsedError) return { ok: false, reason: "NOT_FOUND" };
    if (error instanceof AlreadyRedeemedError) return { ok: true, fullMockTestId: row.fullMockTestId };
    throw error;
  }

  return { ok: true, fullMockTestId: row.fullMockTestId };
}

/**
 * The code a student may start a NEW sitting of this mock with, if any: one
 * they have redeemed, that is still active and unexpired, and under which
 * they haven't already completed their sitting. The single source of truth
 * for both the page-level gate and the action-level gate in
 * startFullMockAttemptAction — so a finished sitting can't be quietly
 * repeated with the same code.
 */
export async function getRedeemedAccessCodeForFullMockTest(studentId: string, fullMockTestId: string) {
  const now = new Date();
  return prisma.mockAccessCode.findFirst({
    where: {
      fullMockTestId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      redemptions: { some: { studentId } },
      NOT: { attempts: { some: { studentId, status: "COMPLETED" } } },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}

export async function hasRedeemedAccessCodeForFullMockTest(studentId: string, fullMockTestId: string): Promise<boolean> {
  return (await getRedeemedAccessCodeForFullMockTest(studentId, fullMockTestId)) != null;
}

// ---------------------------------------------------------------------------
// Results scoreboard (Goals 4/5/6/7) — reuses the one real band-composition
// helper (src/lib/full-mock-band-composition.ts) exactly as the existing
// student results page and teacher analytics already do; no new scoring
// logic, just a new real per-attempt view onto the same underlying rows.
// ---------------------------------------------------------------------------

export type MockSectionScore = { correct: number; total: number };

export type MockResultRow = {
  attemptId: string;
  accessCode: string | null;
  mockTitle: string;
  fullMockTestId: string;
  studentName: string;
  studentEmail: string;
  readingBand: number | null;
  listeningBand: number | null;
  writingBand: number | null;
  speakingBand: number | null;
  /** Marks earned out of marks available once the section is handed in; null while it is still open or never started. */
  listeningScore: MockSectionScore | null;
  readingScore: MockSectionScore | null;
  /** "Not started" / "In progress" / "Submitted — AI estimate" / "Graded" … — null when the mock has no Writing section. */
  writingStatus: string | null;
  overallBand: number | null;
  /** "Overall (L/R/W, unofficial)": which skills the combined figure is made of. */
  overallLabel: string;
  status: "IN_PROGRESS" | "COMPLETED";
  /** Phase K - true when any section of the sitting ended because its time ran out (finalised by the browser at the deadline or by the server). */
  hadTimeExpiry: boolean;
  /** The section the student is sitting right now ("Listening", "Reading", "Writing", "Speaking"); null once the sitting is over. */
  currentSection: string | null;
  startedAt: Date;
  /** null while the sitting is still in progress. */
  completedAt: Date | null;
  /** Phase K - the sum of the sections' time used (not the clock time from first click to last); null while in progress. */
  durationSeconds: number | null;
  timeUsed: FullMockTimeUsed;
  /** Which skills this mock actually contains — a column for a skill it doesn't test shows "n/a" instead of an empty cell that looks like a missing score. */
  includes: { writing: boolean; speaking: boolean };
};

export async function listMockResultsForTeacher(teacherId: string, search?: string): Promise<MockResultRow[]> {
  // Phase K - a section whose time ended while nobody was looking is finalised before the table is drawn.
  await settleOverdueAttempts({ fullMockTest: { createdById: teacherId } }).catch(() => undefined);
  const attempts = await prisma.fullMockAttempt.findMany({
    where: { fullMockTest: { createdById: teacherId } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      writingStartedAt: true,
      writingEndedAt: true,
      writingEndReason: true,
      fullMockTestId: true,
      fullMockTest: { select: { title: true, _count: { select: { writingSections: true, speakingSections: true } } } },
      student: { select: { user: { select: { name: true, email: true } } } },
      accessCode: { select: { code: true } },
      sectionResults: {
        select: {
          section: true,
          result: {
            select: { bandScore: true, rawScore: true, completedAt: true, durationSeconds: true, endReason: true, mockTest: { select: { questions: { select: { points: true } } } } },
          },
          writingSubmission: { select: { status: true, bandScore: true, taskType: true, submittedAt: true, analysis: { select: { estimatedBand: true } } } },
          speakingSubmission: { select: { bandScore: true } },
        },
      },
    },
  });

  const rows: MockResultRow[] = attempts.map((attempt) => {
    const writingSectionCount = attempt.fullMockTest._count.writingSections;
    const speakingSectionCount = attempt.fullMockTest._count.speakingSections;

    // A section's score only exists once the student handed it in — an open Reading paper has no mark yet.
    const scoreOf = (section: "LISTENING" | "READING"): MockSectionScore | null => {
      const result = attempt.sectionResults.find((r) => r.section === section)?.result;
      if (!result?.completedAt || result.rawScore == null) return null;
      return { correct: result.rawScore, total: result.mockTest.questions.reduce((sum, q) => sum + q.points, 0) };
    };
    const handedIn = (section: "LISTENING" | "READING") => attempt.sectionResults.some((r) => r.section === section && r.result?.completedAt != null);
    const writingStatus = writingProgressLabel({ taskCount: writingSectionCount, started: attempt.writingStartedAt != null, rows: attempt.sectionResults });
    const writingDone =
      attempt.sectionResults.filter((r) => r.section === "WRITING" && r.writingSubmission && r.writingSubmission.status !== "DRAFT").length >= writingSectionCount;

    const lastWritingHandIn = attempt.sectionResults.map((r) => r.writingSubmission?.submittedAt).filter((d): d is Date => d != null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const timeUsed = fullMockTimeUsed({
      listeningSeconds: attempt.sectionResults.find((r) => r.section === "LISTENING")?.result?.durationSeconds,
      readingSeconds: attempt.sectionResults.find((r) => r.section === "READING")?.result?.durationSeconds,
      hasWriting: writingSectionCount > 0,
      writingStartedAt: attempt.writingStartedAt,
      writingEndedAt: attempt.writingEndedAt ?? lastWritingHandIn,
    });

    let currentSection: string | null = null;
    if (attempt.status === "IN_PROGRESS") {
      if (!handedIn("LISTENING")) currentSection = "Listening";
      else if (!handedIn("READING")) currentSection = "Reading";
      else if (writingSectionCount > 0 && !writingDone) currentSection = "Writing";
      else if (speakingSectionCount > 0) currentSection = "Speaking";
    }

    return {
      attemptId: attempt.id,
      accessCode: attempt.accessCode?.code ?? null,
      mockTitle: attempt.fullMockTest.title,
      fullMockTestId: attempt.fullMockTestId,
      studentName: attempt.student.user.name ?? attempt.student.user.email,
      studentEmail: attempt.student.user.email,
      readingBand: bandForSection(attempt.sectionResults, "READING"),
      listeningBand: bandForSection(attempt.sectionResults, "LISTENING"),
      writingBand: bandForSection(attempt.sectionResults, "WRITING"),
      speakingBand: bandForSection(attempt.sectionResults, "SPEAKING"),
      listeningScore: scoreOf("LISTENING"),
      readingScore: scoreOf("READING"),
      writingStatus,
      overallBand: overallBandFromSections(attempt.sectionResults, requiredSectionsFor({ writingSectionCount, speakingSectionCount })),
      overallLabel: overallBandLabel(requiredSectionsFor({ writingSectionCount, speakingSectionCount })),
      status: attempt.status,
      hadTimeExpiry: attempt.writingEndReason === "TIME_EXPIRED" || attempt.sectionResults.some((r) => r.result?.endReason === "TIME_EXPIRED"),
      currentSection,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      durationSeconds: attempt.completedAt ? timeUsed.total : null,
      timeUsed,
      includes: { writing: writingSectionCount > 0, speaking: speakingSectionCount > 0 },
    };
  });

  if (!search?.trim()) return rows;
  const q = search.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (r.accessCode && r.accessCode.toLowerCase().includes(q)) ||
      r.studentName.toLowerCase().includes(q) ||
      r.studentEmail.toLowerCase().includes(q) ||
      r.mockTitle.toLowerCase().includes(q)
  );
}
