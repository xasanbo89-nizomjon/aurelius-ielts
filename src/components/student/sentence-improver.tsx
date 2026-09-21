"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, MousePointerClick, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { requestSentenceImprovementAction } from "@/actions/writing.actions";
import type { SentenceImprovementRecord } from "@/lib/ai/writing";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function SentenceImprover({
  submissionId,
  content,
  initialImprovements,
}: {
  submissionId: string;
  content: string;
  initialImprovements: SentenceImprovementRecord[];
}) {
  const sentences = useMemo(() => splitSentences(content), [content]);
  const [cache, setCache] = useState<Map<string, SentenceImprovementRecord>>(
    () => new Map(initialImprovements.map((improvement) => [improvement.originalSentence, improvement]))
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const result = selected ? (cache.get(selected) ?? null) : null;

  function handleSelect(sentence: string) {
    setSelected(sentence);
    if (cache.has(sentence)) return;

    startTransition(async () => {
      const response = await requestSentenceImprovementAction(submissionId, sentence);
      if (!response.success) {
        toast.error(response.error);
        return;
      }
      setCache((prev) => new Map(prev).set(sentence, response.improvement));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MousePointerClick className="text-accent size-4.5" aria-hidden="true" /> Sentence Improver
        </CardTitle>
        <CardDescription>Click any sentence from your response to get a stronger version of it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed">
          {sentences.map((sentence, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(sentence)}
              className={cn(
                "rounded px-0.5 text-left outline-none transition-colors",
                "hover:bg-accent/15 focus-visible:bg-accent/15",
                selected === sentence && "bg-accent/20"
              )}
            >
              {sentence}{" "}
            </button>
          ))}
        </p>

        {selected && (
          <div className="border-border/70 space-y-3 rounded-xl border p-4">
            {pending && !result ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Improving this sentence…
              </div>
            ) : result ? (
              <>
                <div>
                  <p className="text-muted-foreground text-xs font-medium">Why it&apos;s weak</p>
                  <p className="text-sm">{result.weaknessExplanation}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium">Better version</p>
                  <p className="text-success text-sm">{result.improvedVersion}</p>
                </div>
                {result.strongerVocabulary.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground text-xs font-medium">Stronger vocabulary</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.strongerVocabulary.map((word, index) => (
                        <Badge key={index} variant="accent">
                          <Sparkles className="size-3" aria-hidden="true" />
                          {word}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs font-medium">More natural structure</p>
                  <p className="text-muted-foreground text-sm">{result.structureNote}</p>
                </div>
              </>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
