"use client";

import { useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { toggleArticleBookmarkAction } from "@/actions/bookmarks.actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Phase 36 — Part 8. Reading Library entry point — bookmark this article to resume/revisit it later. */
export function ArticleBookmarkButton({ articleId, initialBookmarked }: { articleId: string; initialBookmarked: boolean }) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);

  async function handleToggle() {
    setPending(true);
    const result = await toggleArticleBookmarkAction(articleId);
    setPending(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setBookmarked(result.bookmarked);
    toast.success(result.bookmarked ? "Added to your Reading Library." : "Removed from your Reading Library.");
  }

  return (
    <Button variant="outline" size="sm" onClick={handleToggle} disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
      )}
      {bookmarked ? "In Reading Library" : "Add to Reading Library"}
    </Button>
  );
}
