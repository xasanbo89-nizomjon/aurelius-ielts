import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTeacherProfile } from "@/lib/session";
import { getFullMockVersionHints } from "@/lib/exam/test-versions";
import { getFullMockCompleteness, getFullMockTestForEdit, listPickableTestsForFullMock } from "@/lib/full-mock-tests";
import { PageHeader } from "@/components/dashboard/page-header";
import { FullMockWizard } from "@/components/teacher/full-mock/full-mock-wizard";

export const metadata: Metadata = { title: "Edit Full Mock Test" };

export default async function EditFullMockTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireTeacherProfile();

  const [test, pickableReading, pickableListening] = await Promise.all([
    getFullMockTestForEdit(id, profile.id),
    listPickableTestsForFullMock(profile.id, "READING"),
    listPickableTestsForFullMock(profile.id, "LISTENING"),
  ]);

  if (!test) notFound();
  // Phase L2 - "Use newest version": looked up only for a Full Mock this teacher may open.
  const versionHints = await getFullMockVersionHints(test.id, profile.id);

  const completeness = getFullMockCompleteness(test);

  return (
    <>
      <PageHeader title={test.title} description="Full Mock Test builder — every step saves as you go." />
      <FullMockWizard
        test={test}
        pickableReading={pickableReading}
        pickableListening={pickableListening}
        completeness={completeness}
        versionHints={versionHints}
      />
    </>
  );
}
