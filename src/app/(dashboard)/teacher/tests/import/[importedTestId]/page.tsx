import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTeacherProfile } from "@/lib/session";
import { getImportedTestForReview, OwnershipError } from "@/lib/pdf-test-import";
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

  return (
    <>
      <PageHeader title="Review PDF Import" description={importedTest.sourceFileName} />
      <PdfTestImportReviewer importedTest={importedTest} />
    </>
  );
}
