"use client";

import { useState, useTransition } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { requestRewriteAction } from "@/actions/writing.actions";
import type { RewriteTargetBand } from "@/lib/validations/writing";
import type { WritingRewriteRecord } from "@/lib/ai/writing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const TARGET_BANDS: RewriteTargetBand[] = [7, 8, 9];

export function WritingRewrites({
  submissionId,
  initialRewrites,
  hasAnalysis,
}: {
  submissionId: string;
  initialRewrites: WritingRewriteRecord[];
  hasAnalysis: boolean;
}) {
  const [rewrites, setRewrites] = useState<Map<number, WritingRewriteRecord>>(
    new Map(initialRewrites.map((r) => [r.targetBand, r]))
  );
  const [pendingBand, setPendingBand] = useState<RewriteTargetBand | null>(null);
  const [openValue, setOpenValue] = useState<string>(initialRewrites[0] ? `band-${initialRewrites[0].targetBand}` : "");
  const [, startTransition] = useTransition();

  function handleRewrite(band: RewriteTargetBand) {
    setPendingBand(band);
    startTransition(async () => {
      const result = await requestRewriteAction(submissionId, band);
      setPendingBand(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setRewrites((prev) => new Map(prev).set(band, result.rewrite));
      setOpenValue(`band-${band}`);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Wand2 className="text-accent size-4.5" aria-hidden="true" />
          <p className="text-sm font-medium">Rewriter</p>
        </div>

        {!hasAnalysis ? (
          <p className="text-muted-foreground text-sm">Run AI analysis first to unlock rewrites.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {TARGET_BANDS.map((band) => (
                <Button
                  key={band}
                  type="button"
                  variant={rewrites.has(band) ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => handleRewrite(band)}
                  disabled={pendingBand !== null}
                >
                  {pendingBand === band && <Loader2 className="size-4 animate-spin" />}
                  Rewrite at Band {band}
                </Button>
              ))}
            </div>

            {rewrites.size > 0 && (
              <Accordion type="single" collapsible value={openValue} onValueChange={setOpenValue}>
                {TARGET_BANDS.filter((band) => rewrites.has(band)).map((band) => {
                  const rewrite = rewrites.get(band)!;
                  return (
                    <AccordionItem key={band} value={`band-${band}`}>
                      <AccordionTrigger>Band {band} rewrite</AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{rewrite.content}</p>
                        <p className="text-muted-foreground border-border/70 border-t pt-3 text-xs leading-relaxed">
                          {rewrite.notes}
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
