"use client";

import { useState } from "react";
import type { VocabularyStatus } from "@prisma/client";
import { Loader2, Sparkles, Trash2 } from "lucide-react";

import { explainWordAction } from "@/actions/vocabulary-ai.actions";
import { ARTICLE_DIFFICULTY_LABELS, VOCABULARY_STATUS_COLORS, VOCABULARY_STATUS_LABELS } from "@/lib/labels";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VocabularyCardEntry } from "@/components/student/vocabulary-card";
import type { WordExplanation, WordIntelligence } from "@/lib/ai/vocabulary-assistant";

const STATUS_EMOJI: Record<VocabularyStatus, string> = { UNKNOWN: "🔴", LEARNING: "🟡", KNOWN: "🔵" };
const STATUS_ORDER: VocabularyStatus[] = ["UNKNOWN", "LEARNING", "KNOWN"];

export type WordDetailsEntry = VocabularyCardEntry & WordIntelligence & { hasAiInsights: boolean };

function WordBadgeList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-xs italic">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="secondary">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function AiInsightsPanel({ entry, loading, error }: { entry: WordDetailsEntry; loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Generating AI insights…
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive py-2 text-sm">{error}</p>;
  }

  if (!entry.hasAiInsights) return null;

  return (
    <div className="space-y-3 border-t border-border/70 pt-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-medium">AI Insights</p>
        {entry.ieltsDifficulty && <Badge variant="accent">IELTS: {ARTICLE_DIFFICULTY_LABELS[entry.ieltsDifficulty]}</Badge>}
      </div>

      {(entry.ipaPronunciation || entry.stressPattern) && (
        <div>
          <p className="text-muted-foreground text-xs font-medium">Pronunciation</p>
          <p className="text-sm">
            {entry.ipaPronunciation && <span className="font-display">{entry.ipaPronunciation}</span>}
            {entry.stressPattern && <span className="text-muted-foreground"> — {entry.stressPattern}</span>}
          </p>
        </div>
      )}

      <div>
        <p className="text-muted-foreground text-xs font-medium">Synonyms</p>
        <WordBadgeList items={entry.synonyms} emptyLabel="None found" />
      </div>

      <div>
        <p className="text-muted-foreground text-xs font-medium">Opposites</p>
        <WordBadgeList items={entry.opposites} emptyLabel="This word has no natural opposite" />
      </div>

      <div>
        <p className="text-muted-foreground text-xs font-medium">Related words (IELTS Writing)</p>
        <WordBadgeList items={entry.relatedWords} emptyLabel="None found" />
      </div>

      {entry.wordFamily.length > 0 && (
        <div>
          <p className="text-muted-foreground text-xs font-medium">Word family</p>
          <ul className="text-sm">
            {entry.wordFamily.map((form) => (
              <li key={`${form.form}-${form.word}`}>
                <span className="text-muted-foreground capitalize">{form.form}:</span> {form.word}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(entry.simpleExamples.length > 0 || entry.ieltsExamples.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-medium">More examples</p>
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {entry.simpleExamples.map((sentence, i) => (
              <li key={`simple-${i}`}>{sentence}</li>
            ))}
            {entry.ieltsExamples.map((sentence, i) => (
              <li key={`ielts-${i}`} className="italic">
                {sentence}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ExplainWordSection({ word }: { word: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [explanation, setExplanation] = useState<WordExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchExplanation() {
    setStatus("loading");
    setError(null);
    const result = await explainWordAction(word);
    if (result.success) {
      setExplanation(result.explanation);
      setStatus("loaded");
    } else {
      setError(result.error);
      setStatus("error");
    }
  }

  function handleValueChange(value: string) {
    const next = value === "explain";
    setOpen(next);
    if (next && status === "idle") void fetchExplanation();
  }

  const sections: { key: keyof WordExplanation; label: string }[] = [
    { key: "meaning", label: "Meaning" },
    { key: "usage", label: "Usage" },
    { key: "commonMistakes", label: "Common mistakes" },
    { key: "whenToUse", label: "When to use it" },
    { key: "whenNotToUse", label: "When NOT to use it" },
  ];

  return (
    <Accordion type="single" collapsible value={open ? "explain" : ""} onValueChange={handleValueChange}>
      <AccordionItem value="explain" className="border-none">
        <AccordionTrigger className="bg-secondary/40 text-accent hover:bg-secondary/60 rounded-lg px-3 py-2 text-xs font-medium hover:no-underline">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
            Explain Word
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-1">
          {status === "loading" && (
            <div className="text-muted-foreground flex items-center gap-2 py-3 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Generating explanation…
            </div>
          )}

          {status === "error" && (
            <div className="space-y-2 py-3 text-sm">
              <p className="text-destructive">{error}</p>
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => void fetchExplanation()}>
                Try again
              </Button>
            </div>
          )}

          {status === "loaded" && explanation && (
            <dl className="space-y-3 py-3">
              {sections.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-foreground text-xs font-medium">{label}</dt>
                  <dd className="text-muted-foreground text-sm">{explanation[key]}</dd>
                </div>
              ))}
            </dl>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function WordDetailsModal({
  entry,
  onOpenChange,
  onStatusChange,
  onDelete,
  savingStatus,
  deleting,
  aiLoading,
  aiError,
}: {
  entry: WordDetailsEntry | null;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (status: VocabularyStatus) => void;
  onDelete: () => void;
  savingStatus: boolean;
  deleting: boolean;
  aiLoading: boolean;
  aiError: string | null;
}) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  return (
    <>
      <Dialog open={!!entry} onOpenChange={onOpenChange}>
        {entry && (
          <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl uppercase">{entry.word}</DialogTitle>
              <DialogDescription>Saved on {entry.addedAt.toLocaleDateString()}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs font-medium">Translation</p>
                <p>{entry.uzbekTranslation || <span className="text-muted-foreground italic">Not available yet</span>}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium">Definition</p>
                <p>{entry.englishDefinition || <span className="text-muted-foreground italic">Not available yet</span>}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium">Example</p>
                <p>{entry.exampleSentence || <span className="text-muted-foreground italic">Not available yet</span>}</p>
              </div>
            </div>

            <AiInsightsPanel entry={entry} loading={aiLoading} error={aiError} />

            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-medium">Status</p>
              <div className="flex items-center gap-1.5">
                {STATUS_ORDER.map((status) => {
                  const colors = VOCABULARY_STATUS_COLORS[status];
                  const active = entry.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={savingStatus}
                      onClick={() => onStatusChange(status)}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-xs font-medium transition-colors disabled:opacity-50",
                        active ? `${colors.bg} ${colors.border} ${colors.text}` : "border-border/70 hover:bg-secondary/60"
                      )}
                    >
                      <span>{STATUS_EMOJI[status]}</span>
                      {VOCABULARY_STATUS_LABELS[status]}
                    </button>
                  );
                })}
              </div>
            </div>

            <ExplainWordSection word={entry.word} />

            <DialogFooter className="sm:justify-between">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Remove
              </Button>
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove &ldquo;{entry?.word}&rdquo;?</DialogTitle>
            <DialogDescription>
              This removes it from your vocabulary notebook. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDeleteOpen(false);
                onDelete();
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
