"use client";

import { useState, useTransition } from "react";
import { Bookmark } from "lucide-react";

import { toggleWritingTaskBookmarkAction } from "@/actions/bookmarks.actions";
import { cn } from "@/lib/utils";

export function WritingTaskBookmarkButton({ taskId, initialBookmarked }: { taskId: string; initialBookmarked: boolean }) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setBookmarked((prev) => !prev);
    startTransition(async () => {
      const result = await toggleWritingTaskBookmarkAction(taskId);
      if (result.success) setBookmarked(result.bookmarked);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark this task"}
      className={cn(
        "focus-visible:ring-ring/50 shrink-0 rounded-md p-1.5 outline-none focus-visible:ring-2",
        bookmarked ? "text-accent" : "text-muted-foreground hover:text-accent"
      )}
    >
      <Bookmark className={cn("size-4", bookmarked && "fill-current")} />
    </button>
  );
}
