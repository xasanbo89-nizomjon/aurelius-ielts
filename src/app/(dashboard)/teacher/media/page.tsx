import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { getTeacherStorageUsage, listMediaFiles, listMediaFolders } from "@/lib/media-library";
import { PageHeader } from "@/components/dashboard/page-header";
import { MediaLibraryManager } from "@/components/teacher/media-library-manager";

export const metadata: Metadata = { title: "Media Library" };

export default async function MediaLibraryPage() {
  const { profile } = await requireTeacherProfile();

  const [files, folders, storage] = await Promise.all([
    listMediaFiles(profile.id),
    listMediaFolders(profile.id),
    getTeacherStorageUsage(profile.id),
  ]);

  return (
    <>
      <PageHeader
        title="Media Library"
        description="Upload once, reuse everywhere — audio, images, and PDFs for Reading, Listening, and Articles."
      />
      <MediaLibraryManager
        initialFiles={files}
        folders={folders.map((f) => ({ id: f.id, name: f.name, fileCount: f._count.files }))}
        storageUsage={storage}
      />
    </>
  );
}
