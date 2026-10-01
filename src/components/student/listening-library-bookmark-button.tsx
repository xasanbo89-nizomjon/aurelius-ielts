"use client";

import { useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { toggleListeningLibraryBookmarkAction } from "@/actions/bookmarks.actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ListeningLibraryBookmarkButton({ itemId, initialBookmarked }: { itemId: string; initialBookmarked: boolean }) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);

  async function handleToggle() {
    setPending(true);
    const result = await toggleListeningLibraryBookmarkAction(itemId);
    setPending(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setBookmarked(result.bookmarked);
    toast.success(result.bookmarked ? "Bookmarked." : "Bookmark removed.");
  }

  return (
    <Button variant="outline" size="sm" onClick={handleToggle} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Bookmark className={cn("size-4", bookmarked && "fill-current")} />}
      {bookmarked ? "Bookmarked" : "Bookmark"}
    </Button>
  );
}
