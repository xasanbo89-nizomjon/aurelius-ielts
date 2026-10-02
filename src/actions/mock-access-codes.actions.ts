"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import * as mockAccessCodes from "@/lib/mock-access-codes";
import {
  createMockAccessCodeSchema,
  createBulkMockAccessCodesSchema,
  updateMockAccessCodeExpirySchema,
  updateMockAccessCodeMaxRedemptionsSchema,
  redeemMockAccessCodeSchema,
} from "@/lib/validations/mock-access-codes";
import { friendlyErrorMessage } from "@/lib/validation-error";
import { toCsv } from "@/lib/exports/csv";
import { toXlsx } from "@/lib/exports/xlsx";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export async function createMockAccessCodeAction(fullMockTestId: string, input: unknown): Promise<ActionResult & { code?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createMockAccessCodeSchema.parse(input);
    const row = await mockAccessCodes.createMockAccessCode(fullMockTestId, profile.id, {
      assignedStudentId: parsed.assignedStudentId,
      expiresAt: parsed.expiresAt ?? null,
      maxRedemptions: parsed.maxRedemptions,
    });
    revalidatePath(`/teacher/tests/full-mock/${fullMockTestId}/access-codes`);
    return { success: true, code: row.code };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the access code.") };
  }
}

export type CreateBulkResult = (ActionResult & { codes?: string[] }) | { success: false; error: string };

export async function createBulkMockAccessCodesAction(fullMockTestId: string, input: unknown): Promise<CreateBulkResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createBulkMockAccessCodesSchema.parse(input);
    const rows = await mockAccessCodes.createBulkMockAccessCodes(fullMockTestId, profile.id, {
      count: parsed.count,
      expiresAt: parsed.expiresAt ?? null,
      maxRedemptions: parsed.maxRedemptions,
    });
    revalidatePath(`/teacher/tests/full-mock/${fullMockTestId}/access-codes`);
    return { success: true, codes: rows.map((r) => r.code) };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not generate the access codes.") };
  }
}

export async function setMockAccessCodeActiveAction(accessCodeId: string, fullMockTestId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await mockAccessCodes.setMockAccessCodeActive(accessCodeId, profile.id, isActive);
    revalidatePath(`/teacher/tests/full-mock/${fullMockTestId}/access-codes`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the access code.") };
  }
}

export async function updateMockAccessCodeExpiryAction(accessCodeId: string, fullMockTestId: string, input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateMockAccessCodeExpirySchema.parse(input);
    await mockAccessCodes.updateMockAccessCodeExpiry(accessCodeId, profile.id, parsed.expiresAt);
    revalidatePath(`/teacher/tests/full-mock/${fullMockTestId}/access-codes`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the expiration date.") };
  }
}

export async function updateMockAccessCodeMaxRedemptionsAction(accessCodeId: string, fullMockTestId: string, input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateMockAccessCodeMaxRedemptionsSchema.parse(input);
    await mockAccessCodes.updateMockAccessCodeMaxRedemptions(accessCodeId, profile.id, parsed.maxRedemptions);
    revalidatePath(`/teacher/tests/full-mock/${fullMockTestId}/access-codes`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update how many students can use this code.") };
  }
}

export async function deleteMockAccessCodeAction(accessCodeId: string, fullMockTestId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await mockAccessCodes.deleteMockAccessCode(accessCodeId, profile.id);
    revalidatePath(`/teacher/tests/full-mock/${fullMockTestId}/access-codes`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the access code.") };
  }
}

export type RedeemMockAccessCodeActionResult = { success: true; fullMockTestId: string } | { success: false; error: string };

/** The only two messages a student ever sees, matching the spec exactly — never more specific, so a student can never tell a nonexistent code apart from one that belongs to someone else. */
export async function redeemMockAccessCodeAction(input: unknown): Promise<RedeemMockAccessCodeActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = redeemMockAccessCodeSchema.parse(input);
    const result = await mockAccessCodes.redeemMockAccessCode(parsed.code, profile.id, { expectedFullMockTestId: parsed.fullMockTestId });
    if (!result.ok) {
      return {
        success: false,
        error: result.reason === "NOT_FOUND" ? "Access code not found" : "This mock is no longer available",
      };
    }
    return { success: true, fullMockTestId: result.fullMockTestId };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not redeem that access code.") };
  }
}

export type ExportFormat = "csv" | "xlsx";
export type ExportMockResultsResult = { success: true; filename: string; mimeType: string; base64: string } | { success: false; error: string };

/** Teacher-scoped — only this teacher's own Full Mock Test attempts, never platform-wide (unlike the root-only reports in src/actions/export.actions.ts). */
export async function exportMockResultsAction(format: ExportFormat, search?: string): Promise<ExportMockResultsResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const rows = await mockAccessCodes.listMockResultsForTeacher(profile.id, search);

    const showSpeaking = rows.some((r) => r.includes.speaking);
    const headers = [
      "Student",
      "Email",
      "Listening",
      "Reading",
      "Writing",
      ...(showSpeaking ? ["Speaking"] : []),
      "Overall Band",
      "Started At",
      "Completed At",
      "Mock Code",
      "Mock",
      "Status",
    ];
    const table = rows.map((r) => [
      r.studentName,
      r.studentEmail,
      r.listeningBand ?? "",
      r.readingBand ?? "",
      r.includes.writing ? (r.writingBand ?? "") : "n/a",
      ...(showSpeaking ? [r.includes.speaking ? (r.speakingBand ?? "") : "n/a"] : []),
      r.overallBand ?? "",
      r.startedAt.toISOString(),
      r.completedAt ? r.completedAt.toISOString() : "",
      r.accessCode ?? "—",
      r.mockTitle,
      r.status === "COMPLETED" ? "Completed" : "In Progress",
    ]);

    const filenameBase = `mock-results-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") {
      const csv = toCsv(headers, table);
      return { success: true, filename: `${filenameBase}.csv`, mimeType: "text/csv", base64: Buffer.from(csv, "utf-8").toString("base64") };
    }

    const buffer = await toXlsx("Mock Results", headers, table);
    return {
      success: true,
      filename: `${filenameBase}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: buffer.toString("base64"),
    };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not export results.") };
  }
}
