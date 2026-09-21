"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { explainMoreAction } from "@/actions/ai.actions";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import type { AiExplanationContent } from "@/lib/ai/explanations";

type Status = "idle" | "loading" | "loaded" | "error";

const SECTION_LABELS: { key: keyof AiExplanationContent; label: string }[] = [
  { key: "whyCorrect", label: "Why the correct answer is correct" },
  { key: "whyIncorrect", label: "Why your answer was incorrect" },
  { key: "keywordEvidence", label: "Keyword evidence" },
  { key: "examStrategy", label: "Exam strategy" },
  { key: "similarMistakeWarning", label: "Watch out for" },
];

export function ExplainMore({ resultId, questionId }: { resultId: string; questionId: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [explanation, setExplanation] = useState<AiExplanationContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchExplanation() {
    setStatus("loading");
    setError(null);
    const result = await explainMoreAction(resultId, questionId);
    if (result.success) {
      setExplanation(result.explanation);
      setStatus("loaded");
    } else {
      setError(result.error);
      setStatus("error");
    }
  }

  function handleValueChange(value: string) {
    const next = value === "explanation";
    setOpen(next);
    if (next && status === "idle") {
      void fetchExplanation();
    }
  }

  return (
    <Accordion type="single" collapsible value={open ? "explanation" : ""} onValueChange={handleValueChange}>
      <AccordionItem value="explanation" className="border-none">
        <AccordionTrigger className="bg-secondary/40 text-accent hover:bg-secondary/60 rounded-lg px-3 py-2 text-xs font-medium hover:no-underline">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
            Explain More
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
              {SECTION_LABELS.map(({ key, label }) => (
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
