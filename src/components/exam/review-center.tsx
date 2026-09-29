"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Flag } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QuestionNavigator, type NavigatorQuestionState } from "@/components/exam/question-navigator";

type FilterKey = "all" | "unanswered" | "flagged" | "answered";

/**
 * Phase 41 — Part 4-7's dedicated Review Center. Rendered as a large modal
 * rather than a real route, so opening/closing it never triggers a page
 * reload (Phase 40 rule 16) — the underlying exam state (answers/flags/
 * timer) is completely unaffected either way, this just changes what's
 * on screen. Reuses QuestionNavigator for the actual grid so a filtered
 * "Unanswered" view looks and behaves exactly like the main navigator.
 */
export function ReviewCenter({
  open,
  onOpenChange,
  questions,
  currentQuestionId,
  onSelect,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: NavigatorQuestionState[];
  currentQuestionId: string;
  onSelect: (questionId: string) => void;
  onSubmit: () => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const answeredCount = questions.filter((q) => q.answered).length;
  const unansweredCount = questions.length - answeredCount;
  const flaggedCount = questions.filter((q) => q.flagged).length;

  const filtered = questions.filter((q) => {
    if (filter === "unanswered") return !q.answered;
    if (filter === "flagged") return q.flagged;
    if (filter === "answered") return q.answered;
    return true;
  });

  function handleSelect(questionId: string) {
    onSelect(questionId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Your Answers</DialogTitle>
          <DialogDescription>Jump to any question, or filter by status.</DialogDescription>
        </DialogHeader>

        <dl className="grid shrink-0 grid-cols-3 gap-3">
          <div className="bg-secondary/60 rounded-xl px-3 py-3 text-center">
            <dt className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
              <CheckCircle2 className="size-3.5" aria-hidden="true" /> Answered
            </dt>
            <dd className="font-display mt-1 text-xl font-medium">{answeredCount}</dd>
          </div>
          <div className={unansweredCount > 0 ? "rounded-xl bg-destructive/10 px-3 py-3 text-center" : "bg-secondary/60 rounded-xl px-3 py-3 text-center"}>
            <dt className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
              <AlertTriangle className="size-3.5" aria-hidden="true" /> Unanswered
            </dt>
            <dd className="font-display mt-1 text-xl font-medium">{unansweredCount}</dd>
          </div>
          <div className="bg-secondary/60 rounded-xl px-3 py-3 text-center">
            <dt className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
              <Flag className="size-3.5" aria-hidden="true" /> Flagged
            </dt>
            <dd className="font-display mt-1 text-xl font-medium">{flaggedCount}</dd>
          </div>
        </dl>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)} className="min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unanswered">Unanswered</TabsTrigger>
            <TabsTrigger value="flagged">Flagged</TabsTrigger>
            <TabsTrigger value="answered">Answered</TabsTrigger>
          </TabsList>
          <TabsContent value={filter} className="overflow-y-auto pt-3">
            {filtered.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {filter === "all" ? "No questions in this test." : `No ${filter} questions.`}
              </p>
            ) : (
              <QuestionNavigator questions={filtered} currentQuestionId={currentQuestionId} onSelect={handleSelect} showCounters={false} />
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Back to Test
          </Button>
          <Button onClick={onSubmit}>Submit Exam</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
