"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { publishFullMockTestAction } from "@/actions/full-mock-tests.actions";
import type { ActiveFullMock, FullMockCompleteness } from "@/lib/full-mock-tests";
import { ArchiveOthersDialog } from "@/components/teacher/full-mock/archive-others-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="text-success size-4 shrink-0" />
      ) : (
        <CircleDashed className="text-muted-foreground size-4 shrink-0" />
      )}
      <span className={done ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

export function ReviewStep({
  fullMockTestId,
  title,
  status,
  completeness,
}: {
  fullMockTestId: string;
  title: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  completeness: FullMockCompleteness;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  // Phase O - the other Full Mock(s) that are active and would be archived: asked about first.
  const [others, setOthers] = useState<ActiveFullMock[] | null>(null);

  async function handlePublish(archiveOthers = false) {
    setPublishing(true);
    const result = await publishFullMockTestAction(fullMockTestId, { archiveOthers });
    setPublishing(false);

    if (!result.success) {
      if (result.needsConfirm) {
        setOthers(result.needsConfirm);
        return;
      }
      toast.error(result.error);
      return;
    }
    setOthers(null);
    toast.success(result.archived && result.archived.length > 0 ? "Full mock test published. The previous Full Mock was archived." : "Full mock test published.");
    router.push("/teacher/tests");
  }

  function handleSaveDraft() {
    toast.success("Saved as draft — every step is saved automatically as you go.");
    router.push("/teacher/tests");
  }

  return (
    <div className="max-w-xl space-y-5">
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">{title}</p>
          <div className="space-y-1.5">
            <ChecklistRow done={completeness.hasReading} label="Reading section selected" />
            <ChecklistRow done={completeness.hasListening} label="Listening section selected" />
            {completeness.hasListening && <ChecklistRow done={completeness.listeningAudioReady} label="Listening audio uploaded for every part" />}
            {(completeness.hasReading || completeness.hasListening) && (
              <ChecklistRow done={completeness.unpublishedTests.length === 0} label="Reading and Listening tests are published" />
            )}
            {completeness.foreignPackageTests.length > 0 && <ChecklistRow done={false} label="All sections come from this mock's own package" />}
            <ChecklistRow done={completeness.hasTask1} label="Writing Task 1 added" />
            <ChecklistRow done={completeness.hasTask2} label="Writing Task 2 added" />
            {completeness.hasSpeaking ? (
              <>
                <ChecklistRow done={completeness.hasPart1} label="Speaking Part 1 question added" />
                <ChecklistRow done={completeness.hasPart2} label="Speaking Part 2 cue card added" />
                <ChecklistRow done={completeness.hasPart3} label="Speaking Part 3 question added" />
              </>
            ) : (
              <p className="text-muted-foreground text-xs">Speaking isn&apos;t included (optional) — this mock is Listening + Reading + Writing.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {status === "PUBLISHED" && (
        <p className="text-success text-sm">
          This full mock test is live — students can see and start it.{" "}
          <Link href={`/teacher/tests/full-mock/${fullMockTestId}/analytics`} className="underline">
            View analytics
          </Link>
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleSaveDraft}>
          Save Draft
        </Button>
        <Button onClick={() => void handlePublish()} disabled={!completeness.isComplete || publishing}>
          {publishing && <Loader2 className="size-4 animate-spin" />}
          {status === "PUBLISHED" ? "Republish" : "Publish"}
        </Button>
      </div>
      <ArchiveOthersDialog open={others != null} others={others ?? []} busy={publishing} onConfirm={() => void handlePublish(true)} onCancel={() => setOthers(null)} />
      {!completeness.isComplete && (
        <p className="text-muted-foreground text-xs">Complete every item above before publishing.</p>
      )}
    </div>
  );
}
