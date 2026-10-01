import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { getTeacherStorageUsage, listMediaFiles, listMediaFolders } from "@/lib/media-library";
import { getSkillCoverImages } from "@/lib/skill-cover-images";
import { PageHeader } from "@/components/dashboard/page-header";
import { MediaLibraryManager } from "@/components/teacher/media-library-manager";
import { SkillCoverImagesManager } from "@/components/teacher/skill-cover-images-manager";

export const metadata: Metadata = { title: "Media Library" };

export default async function MediaLibraryPage() {
  const { profile } = await requireTeacherProfile();

  const [files, folders, storage, skillCovers] = await Promise.all([
    listMediaFiles(profile.id),
    listMediaFolders(profile.id),
    getTeacherStorageUsage(profile.id),
    getSkillCoverImages(),
  ]);

  return (
    <>
      <PageHeader
        title="Media Library"
        description="Upload once, reuse everywhere — audio, images, and PDFs for Reading, Listening, and Articles."
      />
      <SkillCoverImagesManager initial={skillCovers} canEdit={profile.isRootTeacher} />
      <MediaLibraryManager
        initialFiles={files}
        folders={folders.map((f) => ({ id: f.id, name: f.name, fileCount: f._count.files }))}
        storageUsage={storage}
      />
    </>
  );
}
