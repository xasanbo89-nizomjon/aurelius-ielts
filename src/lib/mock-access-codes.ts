import "server-only";
import { randomInt } from "crypto";

import { prisma } from "@/lib/prisma";
import { bandForSection, overallBandFromSections } from "@/lib/full-mock-band-composition";

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
  const test = await prisma.fullMockTest.findFirst({ where: { id: fullMockTestId, createdById: teacherId } });
  if (!test) throw new OwnershipError("You don't have access to this full mock test.");
  return test;
}

// ---------------------------------------------------------------------------
// Create (Goal 1/3) — single, optionally pre-assigned to one student, or bulk/unassigned.
// ---------------------------------------------------------------------------

export async function createMockAccessCode(
  fullMockTestId: string,
  teacherId: string,
  input: { assignedStudentId?: string | null; expiresAt?: Date | null }
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
    },
  });
}

/** Bulk-generates `count` unassigned codes in one batch — each is claimed by whichever student redeems it first (see redeemMockAccessCode). Capped at MAX_BULK_COUNT per call to keep this a deliberate, bounded action. */
export async function createBulkMockAccessCodes(
  fullMockTestId: string,
  teacherId: string,
  input: { count: number; expiresAt?: Date | null }
) {
  await assertOwnsFullMockTest(fullMockTestId, teacherId);
  const count = Math.min(Math.max(1, Math.trunc(input.count)), MAX_BULK_COUNT);

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
    data: [...generated].map((code) => ({ code, fullMockTestId, createdById: teacherId, expiresAt: input.expiresAt || null })),
  });

  return prisma.mockAccessCode.findMany({ where: { code: { in: [...generated] } }, orderBy: { code: "asc" } });
}

// ---------------------------------------------------------------------------
// Management (Goal 8) — mirrors promo-codes.ts's isActive/expiresAt/delete-vs-disable convention exactly.
// ---------------------------------------------------------------------------

export async function setMockAccessCodeActive(accessCodeId: string, teacherId: string, isActive: boolean): Promise<void> {
  const result = await prisma.mockAccessCode.updateMany({ where: { id: accessCodeId, createdById: teacherId }, data: { isActive } });
  if (result.count === 0) throw new Error("Access code not found.");
}

export async function updateMockAccessCodeExpiry(accessCodeId: string, teacherId: string, expiresAt: Date | null): Promise<void> {
  const result = await prisma.mockAccessCode.updateMany({ where: { id: accessCodeId, createdById: teacherId }, data: { expiresAt } });
  if (result.count === 0) throw new Error("Access code not found.");
}

/** Blocked once a code has been redeemed — deleting it would destroy the trail linking a real attempt back to how it started. Deactivate it instead. */
export async function deleteMockAccessCode(accessCodeId: string, teacherId: string): Promise<void> {
  const code = await prisma.mockAccessCode.findFirst({ where: { id: accessCodeId, createdById: teacherId } });
  if (!code) throw new Error("Access code not found.");
  if (code.redeemedByStudentId) {
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

/**
 * Deliberately returns only two outcomes, matching the spec's exact two
 * error strings — "Access code not found" for anything that isn't a valid,
 * reachable code for THIS student (wrong code, assigned to someone else,
 * already claimed by someone else — never distinguished, so a student can
 * never probe which codes exist or who they belong to), and "no longer
 * available" for a code that exists and is theirs but is disabled, expired,
 * or already fully sat (completed).
 */
export async function redeemMockAccessCode(rawCode: string, studentId: string): Promise<RedeemMockAccessCodeResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "NOT_FOUND" };

  const row = await prisma.mockAccessCode.findUnique({ where: { code } });
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  if (row.assignedStudentId && row.assignedStudentId !== studentId) return { ok: false, reason: "NOT_FOUND" };
  if (row.redeemedByStudentId && row.redeemedByStudentId !== studentId) return { ok: false, reason: "NOT_FOUND" };

  if (!row.isActive) return { ok: false, reason: "UNAVAILABLE" };
  if (row.expiresAt && row.expiresAt <= new Date()) return { ok: false, reason: "UNAVAILABLE" };

  if (row.redeemedByStudentId === studentId) {
    // Already this student's own claimed code (pre-assigned or previously
    // claimed) — fine to re-enter, UNLESS their one sitting under it is done.
    const completedAttempt = await prisma.fullMockAttempt.findFirst({
      where: { accessCodeId: row.id, studentId, status: "COMPLETED" },
      select: { id: true },
    });
    if (completedAttempt) return { ok: false, reason: "UNAVAILABLE" };
    return { ok: true, fullMockTestId: row.fullMockTestId };
  }

  // First-time claim of an unassigned/bulk code — atomic so two students
  // racing on the same code can't both win it (same updateMany+count guard
  // promo-codes.ts uses for its usage-limit race).
  const claim = await prisma.mockAccessCode.updateMany({
    where: { id: row.id, redeemedByStudentId: null },
    data: { redeemedByStudentId: studentId, redeemedAt: new Date() },
  });
  if (claim.count === 0) {
    // Someone else won the race in between our read and write.
    return { ok: false, reason: "NOT_FOUND" };
  }

  return { ok: true, fullMockTestId: row.fullMockTestId };
}

/** The exact row a student has already redeemed for this test, if any and still usable — the single source of truth for both the page-level gate and the action-level gate below it. */
export async function getRedeemedAccessCodeForFullMockTest(studentId: string, fullMockTestId: string) {
  const now = new Date();
  return prisma.mockAccessCode.findFirst({
    where: {
      fullMockTestId,
      redeemedByStudentId: studentId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
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
  overallBand: number | null;
  status: "IN_PROGRESS" | "COMPLETED";
  startedAt: Date;
};

export async function listMockResultsForTeacher(teacherId: string, search?: string): Promise<MockResultRow[]> {
  const attempts = await prisma.fullMockAttempt.findMany({
    where: { fullMockTest: { createdById: teacherId } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      fullMockTestId: true,
      fullMockTest: { select: { title: true } },
      student: { select: { user: { select: { name: true, email: true } } } },
      accessCode: { select: { code: true } },
      sectionResults: {
        select: {
          section: true,
          result: { select: { bandScore: true } },
          writingSubmission: { select: { bandScore: true } },
          speakingSubmission: { select: { bandScore: true } },
        },
      },
    },
  });

  const rows: MockResultRow[] = attempts.map((attempt) => ({
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
    overallBand: overallBandFromSections(attempt.sectionResults),
    status: attempt.status,
    startedAt: attempt.startedAt,
  }));

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
