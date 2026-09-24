import type { Metadata } from "next";

import { OfflinePageHeader } from "@/components/offline/offline-page-header";
import { OfflineArticleViewer } from "@/components/offline/offline-article-viewer";

export const metadata: Metadata = { title: "Offline Article" };

export default async function OfflineArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <OfflinePageHeader title="Offline Article" />
      <OfflineArticleViewer articleId={id} />
    </div>
  );
}
