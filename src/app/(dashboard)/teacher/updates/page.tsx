import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { listTeacherUpdates } from "@/lib/updates";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpdatesManager } from "@/components/teacher/updates-manager";

export const metadata: Metadata = { title: "Updates" };

export default async function TeacherUpdatesPage() {
  const { profile } = await requireTeacherProfile();
  const updates = await listTeacherUpdates(profile.id);

  return (
    <>
      <PageHeader
        title="Updates"
        description="Post announcements to the students assigned to you. Only published updates appear on their dashboard."
      />
      <UpdatesManager
        updates={updates.map((update) => ({
          id: update.id,
          title: update.title,
          content: update.content,
          status: update.status,
          publishedAt: update.publishedAt ? update.publishedAt.toISOString() : null,
          createdAt: update.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
