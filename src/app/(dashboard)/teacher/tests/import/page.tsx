import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { listImportedTestsForTeacher } from "@/lib/pdf-test-import";
import { PageHeader } from "@/components/dashboard/page-header";
import { PdfTestImportUploadForm } from "@/components/teacher/pdf-test-import-upload-form";
import { PdfTestImportList, type ImportListRow } from "@/components/teacher/pdf-test-import-list";

export const metadata: Metadata = { title: "Import PDF Test" };

export default async function TeacherPdfTestImportPage() {
  const { profile } = await requireTeacherProfile();
  const imports = await listImportedTestsForTeacher(profile.id);
  const rows: ImportListRow[] = imports.map((row) => ({
    id: row.id,
    type: row.type === "LISTENING" ? "LISTENING" : "READING",
    title: row.title,
    sourceFileName: row.sourceFileName,
    status: row.status,
    errorMessage: row.errorMessage,
    createdTest:
      row.status === "IMPORTED" && row.resultMockTestId && row.resultMockTest
        ? {
            id: row.resultMockTestId,
            title: row.resultMockTest.title,
            attemptCount: row.resultMockTest._count.results,
            ownerMockTitle: row.resultMockTest.packageFullMockTest?.title ?? null,
          }
        : null,
  }));

  return (
    <>
      <PageHeader
        title="Import PDF Test"
        description="Upload a complete IELTS Reading or Listening PDF — passages, question groups and the answer key are detected automatically for you to review before anything is saved."
      />

      <PdfTestImportUploadForm />

      {rows.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-medium">Recent imports</h2>
          <PdfTestImportList rows={rows} />
        </div>
      )}
    </>
  );
}
