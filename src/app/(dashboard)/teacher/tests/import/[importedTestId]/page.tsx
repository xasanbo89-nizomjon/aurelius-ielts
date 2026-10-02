import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTeacherProfile } from "@/lib/session";
import { getImportedTestForReview, validateImportedTestRows, OwnershipError } from "@/lib/pdf-test-import";
import { PageHeader } from "@/components/dashboard/page-header";
import { PdfTestImportReviewer } from "@/components/teacher/pdf-test-import-reviewer";

export const metadata: Metadata = { title: "Review PDF Import" };

export default async function PdfTestImportReviewPage({ params }: { params: Promise<{ importedTestId: string }> }) {
  const { importedTestId } = await params;
  const { profile } = await requireTeacherProfile();

  let importedTest;
  try {
    importedTest = await getImportedTestForReview(importedTestId, profile.id);
  } catch (error) {
    if (error instanceof OwnershipError) notFound();
    throw error;
  }

  // Computed here, from the stored rows, with the same function confirmImport enforces — so what the teacher sees on this page is exactly what will be checked at import.
  const validation = validateImportedTestRows(importedTest);

  return (
    <>
      <PageHeader title="Review PDF Import" description={importedTest.sourceFileName} />
      <PdfTestImportReviewer importedTest={importedTest} validation={validation} />
    </>
  );
}
