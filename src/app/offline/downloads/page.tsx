import type { Metadata } from "next";

import { OfflinePageHeader } from "@/components/offline/offline-page-header";
import { OfflineDownloadsView } from "@/components/offline/offline-downloads-view";

export const metadata: Metadata = { title: "Offline Downloads" };

export default function OfflineDownloadsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <OfflinePageHeader title="Downloads" />
      <OfflineDownloadsView />
    </div>
  );
}
