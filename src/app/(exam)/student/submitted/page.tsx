import type { Metadata } from "next";

import { requireStudentProfile } from "@/lib/session";
import { SubmittedNotice } from "@/components/student/submitted-notice";
import { LateTextUploader } from "@/components/student/late-text-uploader";

export const metadata: Metadata = { title: "Test submitted" };

const BACK: Record<string, { href: string; label: string }> = {
  writing: { href: "/student/writing/tasks", label: "Back to Writing tasks" },
  "full-mock": { href: "/student/tests/mock", label: "Back to Mock Exams" },
};

/**
 * Phase O - the generic "Your test has been submitted." page for a Writing test and for a finished Full Mock, whose results are never shown to the student. It says
 * nothing about the work: no band, no feedback, no hint of how it went. (LateTextUploader keeps doing its Phase K job: words the browser still held after the
 * paper ended are sent for the teacher, whatever the student is shown.)
 */
export default async function SubmittedPage({ searchParams }: { searchParams: Promise<{ for?: string | string[] }> }) {
  await requireStudentProfile();
  const { for: kindParam } = await searchParams;
  const kind = Array.isArray(kindParam) ? kindParam[0] : kindParam;
  return (
    <SubmittedNotice back={kind ? BACK[kind] : undefined}>
      <LateTextUploader />
    </SubmittedNotice>
  );
}
