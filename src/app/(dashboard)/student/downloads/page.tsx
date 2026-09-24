import type { Metadata } from "next";

import { requireStudentProfile } from "@/lib/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { DownloadManager } from "@/components/student/download-manager";

export const metadata: Metadata = { title: "Downloads" };

export default async function StudentDownloadsPage() {
  await requireStudentProfile();

  return (
    <>
      <PageHeader
        title="Smart Study Downloads"
        description="Save your vocabulary, bookmarks and study plan on this device so you can review them with no connection."
      />
      <DownloadManager />
    </>
  );
}
