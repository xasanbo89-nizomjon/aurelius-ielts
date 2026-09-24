import type { Metadata } from "next";

import { OfflinePageHeader } from "@/components/offline/offline-page-header";
import { OfflineArticlesList } from "@/components/offline/offline-articles-list";

export const metadata: Metadata = { title: "Offline Articles" };

export default function OfflineArticlesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <OfflinePageHeader title="Offline Articles" />
      <OfflineArticlesList />
    </div>
  );
}
