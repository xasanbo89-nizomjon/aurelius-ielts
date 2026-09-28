"use server";

import { requireTeacherProfile } from "@/lib/session";
import { buildStudentPerformanceReport, buildTeacherPerformanceReport, buildPlatformReport, type ReportTable } from "@/lib/exports/reports";
import { toCsv } from "@/lib/exports/csv";
import { toXlsx } from "@/lib/exports/xlsx";

export type ExportFormat = "csv" | "xlsx";
export type ExportReportKind = "student-performance" | "teacher-performance" | "platform";

export type ExportResult =
  | { success: true; filename: string; mimeType: string; base64: string }
  | { success: false; error: string };

const REPORT_BUILDERS: Record<ExportReportKind, () => Promise<ReportTable>> = {
  "student-performance": buildStudentPerformanceReport,
  "teacher-performance": buildTeacherPerformanceReport,
  platform: buildPlatformReport,
};

const REPORT_LABELS: Record<ExportReportKind, string> = {
  "student-performance": "student-performance-report",
  "teacher-performance": "teacher-performance-report",
  platform: "platform-report",
};

/** Root-only — every report reads platform-wide data across every teacher's students. */
export async function exportReportAction(kind: ExportReportKind, format: ExportFormat): Promise<ExportResult> {
  try {
    const { profile } = await requireTeacherProfile();
    if (!profile.isRootTeacher) {
      return { success: false, error: "Only the root teacher can export reports." };
    }

    const table = await REPORT_BUILDERS[kind]();
    const filenameBase = `${REPORT_LABELS[kind]}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "csv") {
      const csv = toCsv(table.headers, table.rows);
      return { success: true, filename: `${filenameBase}.csv`, mimeType: "text/csv", base64: Buffer.from(csv, "utf-8").toString("base64") };
    }

    const buffer = await toXlsx(REPORT_LABELS[kind], table.headers, table.rows);
    return {
      success: true,
      filename: `${filenameBase}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: buffer.toString("base64"),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not generate the report." };
  }
}
