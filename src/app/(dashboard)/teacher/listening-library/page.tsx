import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { listListeningLibraryItemsForTeacher } from "@/lib/listening-library";
import { PageHeader } from "@/components/dashboard/page-header";
import { ListeningLibraryManager } from "@/components/teacher/listening-library-manager";

export const metadata: Metadata = { title: "Listening Library" };

export default async function TeacherListeningLibraryPage() {
  const { profile } = await requireTeacherProfile();
  const items = await listListeningLibraryItemsForTeacher(profile.id);

  return (
    <>
      <PageHeader
        title="Listening Library"
        description="Upload real standalone listening audio for your students — set accent, level, and an optional transcript."
      />
      <ListeningLibraryManager
        items={items.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          level: item.level,
          accent: item.accent,
          transcript: item.transcript,
          audioPath: item.audioPath,
          audioFileName: item.audioFileName,
          audioDurationSeconds: item.audioDurationSeconds,
          coverImagePath: item.coverImagePath,
          status: item.status,
          bookmarkCount: item._count.bookmarks,
        }))}
      />
    </>
  );
}
