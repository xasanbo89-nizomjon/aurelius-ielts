"use client";

import { useEffect, useState } from "react";
import { Check, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { isArticleSavedOffline, saveOfflineArticle, deleteOfflineArticle, type OfflineArticle } from "@/lib/offline/db";
import { Button } from "@/components/ui/button";

/** Real, in-browser save — the article's own already-fetched content, description, and stats (no re-fetch, no extra network call). */
export function SaveArticleOfflineButton({ article }: { article: Omit<OfflineArticle, "savedAt"> }) {
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
