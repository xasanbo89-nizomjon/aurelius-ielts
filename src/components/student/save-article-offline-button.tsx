"use client";

import { useEffect, useState } from "react";
import { Check, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  isArticleSavedOffline,
  saveOfflineArticle,
  deleteOfflineArticle,
  addAnnotation,
  listAnnotationsForArticle,
  type OfflineArticle,
} from "@/lib/offline/db";
import { Button } from "@/components/ui/button";

export type OfflineAnnotationSeed = { id: string; kind: "highlight" | "note"; text: string; createdAt: string };

/**
 * Real, in-browser save — the article's own already-fetched content,
 * description, and stats (no re-fetch, no extra network call). Phase 36 —
 * Part 9: also bundles the student's real online highlights/notes (fetched
 * server-side, passed in as `annotations`) into the same offline store the
 * offline reader already knows how to render, so they're visible offline
 * too — a one-way copy at save time, not a live two-way sync.
 */
export function SaveArticleOfflineButton({
  article,
  annotations = [],
}: {
  article: Omit<OfflineArticle, "savedAt">;
  annotations?: OfflineAnnotationSeed[];
}) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    isArticleSavedOffline(article.id)
      .then(setSaved)
      .catch(() => setSaved(false));
  }, [article.id]);

  async function handleToggle() {
    setPending(true);
    try {
      if (saved) {
        await deleteOfflineArticle(article.id);
        setSaved(false);
        toast.success("Removed from offline articles.");
      } else {
        await saveOfflineArticle({ ...article, savedAt: new Date().toISOString() });

        const existing = await listAnnotationsForArticle(article.id);
        const existingIds = new Set(existing.map((a) => a.id));
        for (const seed of annotations) {
          if (existingIds.has(seed.id)) continue;
          await addAnnotation({ id: seed.id, articleId: article.id, kind: seed.kind, text: seed.text, createdAt: seed.createdAt }).catch(
            () => undefined
          );
        }

        setSaved(true);
        toast.success("Saved — available offline from Offline Articles.");
      }
    } catch {
      toast.error("Offline storage isn't available in this browser.");
    } finally {
      setPending(false);
    }
  }

  if (saved === null) return null;

  return (
    <Button variant="outline" size="sm" onClick={handleToggle} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : saved ? (
        <Check className="size-4" />
      ) : (
        <Download className="size-4" />
      )}
      {saved ? "Saved Offline" : "Save for Offline"}
      {saved && !pending && <Trash2 className="text-muted-foreground ml-1 size-3.5" />}
    </Button>
  );
}
