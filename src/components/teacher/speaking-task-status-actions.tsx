"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setSpeakingTaskStatusAction } from "@/actions/speaking.actions";
import { Button } from "@/components/ui/button";

export function SpeakingTaskStatusActions({
  taskId,
  status,
}: {
  taskId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
}) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(status);

  function setStatus(next: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
    startTransition(async () => {
      const result = await setSpeakingTaskStatusAction(taskId, next);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setCurrent(next);
      toast.success(next === "PUBLISHED" ? "Task published — students can now use the code." : `Task ${next.toLowerCase()}.`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {current !== "PUBLISHED" && (
        <Button size="sm" onClick={() => setStatus("PUBLISHED")} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Publish
        </Button>
      )}
      {current === "PUBLISHED" && (
        <Button size="sm" variant="outline" onClick={() => setStatus("ARCHIVED")} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Archive
        </Button>
      )}
    </div>
  );
}
