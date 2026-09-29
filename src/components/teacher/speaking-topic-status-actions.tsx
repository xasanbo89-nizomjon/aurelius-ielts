"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setSpeakingTopicStatusAction } from "@/actions/speaking-practice.actions";
import type { SpeakingTopicStatusValue } from "@/lib/validations/speaking-practice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SpeakingTopicStatusActions({ topicId, status }: { topicId: string; status: SpeakingTopicStatusValue }) {
  const [pending, setPending] = useState(false);

  async function handleChange(next: SpeakingTopicStatusValue) {
    setPending(true);
    const result = await setSpeakingTopicStatusAction(topicId, next);
    setPending(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(next === "PUBLISHED" ? "Topic published." : "Topic archived.");
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={status === "ARCHIVED" ? "outline" : status === "PUBLISHED" ? "success" : "outline"}>
        {status === "ARCHIVED" ? "Archived" : status === "PUBLISHED" ? "Published" : "Draft"}
      </Badge>
      {status !== "PUBLISHED" && (
        <Button size="sm" variant="outline" onClick={() => handleChange("PUBLISHED")} disabled={pending}>
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          Publish
        </Button>
      )}
      {status === "PUBLISHED" && (
        <Button size="sm" variant="outline" onClick={() => handleChange("ARCHIVED")} disabled={pending}>
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          Archive
        </Button>
      )}
    </div>
  );
}
