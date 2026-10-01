import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { listReadingLibraryItemsForTeacher } from "@/lib/reading-library";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReadingLibraryManager } from "@/components/teacher/reading-library-manager";

export const metadata: Metadata = { title: "Reading Library" };

export default async function TeacherReadingLibraryPage() {
  const { profile } = await requireTeacherProfile();
  const items = await listReadingLibraryItemsForTeacher(profile.id);

  return (
    <>
      <PageHeader
        title="Reading Library"
        description="Upload real PDF reading materials for your students — set level, category and estimated band."
      />
      <ReadingLibraryManager
        items={items.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          category: item.category,
          level: item.level,
          estimatedBand: item.estimatedBand,
          wordCount: item.wordCount,
          pdfPath: item.pdfPath,
          pdfFileName: item.pdfFileName,
          coverImagePath: item.coverImagePath,
          status: item.status,
          bookmarkCount: item._count.bookmarks,
        }))}
      />
    </>
  );
}
