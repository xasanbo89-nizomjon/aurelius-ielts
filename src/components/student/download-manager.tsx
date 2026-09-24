"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookMarked, Bookmark, Download, Loader2, Target, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { getVocabularyDownloadAction, getBookmarksDownloadAction, getStudyPlanDownloadAction } from "@/actions/offline-downloads.actions";
import { saveDownload, listDownloads, type DownloadKey, type OfflineDownload } from "@/lib/offline/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DOWNLOAD_META: Record<DownloadKey, { label: string; description: string; icon: typeof BookMarked }> = {
  vocabulary: { label: "Vocabulary List", description: "Every word you've saved, with translations and definitions.", icon: BookMarked },
  bookmarks: { label: "Bookmarks", description: "Bookmarked questions and writing task prompts.", icon: Bookmark },
  studyPlan: { label: "Study Plan", description: "Your latest AI study plan and roadmap.", icon: Target },
};

export function DownloadManager() {
  const [downloads, setDownloads] = useState<Record<DownloadKey, OfflineDownload | undefined>>({
    vocabulary: undefined,
    bookmarks: undefined,
    studyPlan: undefined,
  });
  const [pending, setPending] = useState<DownloadKey | null>(null);

  useEffect(() => {
    listDownloads()
      .then((rows) => {
        const map: Record<DownloadKey, OfflineDownload | undefined> = { vocabulary: undefined, bookmarks: undefined, studyPlan: undefined };
        for (const row of rows) map[row.key] = row;
        setDownloads(map);
      })
      .catch(() => {});
  }, []);

  async function handleDownload(key: DownloadKey) {
    setPending(key);
    try {
      let data: unknown;
      if (key === "vocabulary") data = await getVocabularyDownloadAction();
      else if (key === "bookmarks") data = await getBookmarksDownloadAction();
      else data = await getStudyPlanDownloadAction();

      const download: OfflineDownload = { key, label: DOWNLOAD_META[key].label, data, savedAt: new Date().toISOString() };
      await saveDownload(download);
      setDownloads((prev) => ({ ...prev, [key]: download }));
      toast.success(`${DOWNLOAD_META[key].label} saved for offline viewing.`);
    } catch {
      toast.error("Could not save this for offline viewing.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(Object.keys(DOWNLOAD_META) as DownloadKey[]).map((key) => {
          const meta = DOWNLOAD_META[key];
          const Icon = meta.icon;
          const existing = downloads[key];
          return (
            <Card key={key}>
              <CardContent className="space-y-3">
                <span className="bg-secondary text-accent flex size-10 items-center justify-center rounded-xl">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="text-muted-foreground text-xs">{meta.description}</p>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => handleDownload(key)} disabled={pending === key}>
                  {pending === key ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  {existing ? "Update" : "Download"}
                </Button>
                {existing && <p className="text-muted-foreground text-[11px]">Saved {new Date(existing.savedAt).toLocaleString()}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button asChild variant="ghost" size="sm">
        <Link href="/offline/downloads">
          <WifiOff className="size-4" /> View saved downloads offline
        </Link>
      </Button>
    </div>
  );
}
