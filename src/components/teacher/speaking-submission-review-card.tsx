"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { reviewSpeakingSubmissionAction } from "@/actions/speaking.actions";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export type SpeakingSubmissionForReview = {
  id: string;
  audioUrl: string;
  status: "PENDING" | "IN_REVIEW" | "REVIEWED" | "DRAFT";
  bandScore: number | null;
  feedback: string | null;
  fluencyBand: number | null;
  lexicalBand: number | null;
  grammarBand: number | null;
  pronunciationBand: number | null;
  createdAt: Date;
  student: { name: string | null; email: string };
};

function criterionField(value: number | null): string {
  return value != null ? String(value) : "";
}

export function SpeakingSubmissionReviewCard({
  taskId,
  submission,
}: {
  taskId: string;
  submission: SpeakingSubmissionForReview;
}) {
  const [bandScore, setBandScore] = useState(submission.bandScore != null ? String(submission.bandScore) : "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [fluencyBand, setFluencyBand] = useState(criterionField(submission.fluencyBand));
  const [lexicalBand, setLexicalBand] = useState(criterionField(submission.lexicalBand));
  const [grammarBand, setGrammarBand] = useState(criterionField(submission.grammarBand));
  const [pronunciationBand, setPronunciationBand] = useState(criterionField(submission.pronunciationBand));
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    const score = Number(bandScore);
    if (!bandScore || Number.isNaN(score) || score < 0 || score > 9) {
      toast.error("Enter a band score between 0 and 9.");
      return;
    }
    if (!feedback.trim()) {
      toast.error("Add feedback for the student.");
      return;
    }

    const parseCriterion = (value: string): number | undefined => {
      if (!value.trim()) return undefined;
      const num = Number(value);
      return Number.isNaN(num) ? undefined : num;
    };

    setSubmitting(true);
    const result = await reviewSpeakingSubmissionAction(submission.id, taskId, {
      bandScore: score,
      feedback,
      fluencyBand: parseCriterion(fluencyBand),
      lexicalBand: parseCriterion(lexicalBand),
      grammarBand: parseCriterion(grammarBand),
      pronunciationBand: parseCriterion(pronunciationBand),
    });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Review saved.");
  }

  return (
    <Card>
      <CardContent className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{submission.student.name ?? submission.student.email}</p>
            <p className="text-muted-foreground text-xs">{formatRelativeTime(submission.createdAt)}</p>
          </div>
          <Badge variant={submission.status === "REVIEWED" ? "success" : "outline"}>{submission.status}</Badge>
        </div>

        <audio controls src={submission.audioUrl} className="w-full" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[100px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={`score-${submission.id}`}>Band</Label>
            <Input
              id={`score-${submission.id}`}
              type="number"
              min={0}
              max={9}
              step={0.5}
              value={bandScore}
              onChange={(event) => setBandScore(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`feedback-${submission.id}`}>Feedback</Label>
            <Textarea
              id={`feedback-${submission.id}`}
              rows={2}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Per-criterion bands (optional — powers Speaking weakness detection)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor={`fluency-${submission.id}`} className="text-xs">
                Fluency
              </Label>
              <Input
                id={`fluency-${submission.id}`}
                type="number"
                min={0}
                max={9}
                step={0.5}
                value={fluencyBand}
                onChange={(event) => setFluencyBand(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`lexical-${submission.id}`} className="text-xs">
                Lexical
              </Label>
              <Input
                id={`lexical-${submission.id}`}
                type="number"
                min={0}
                max={9}
                step={0.5}
                value={lexicalBand}
                onChange={(event) => setLexicalBand(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`grammar-${submission.id}`} className="text-xs">
                Grammar
              </Label>
              <Input
                id={`grammar-${submission.id}`}
                type="number"
                min={0}
                max={9}
                step={0.5}
                value={grammarBand}
                onChange={(event) => setGrammarBand(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`pronunciation-${submission.id}`} className="text-xs">
                Pronunciation
              </Label>
              <Input
                id={`pronunciation-${submission.id}`}
                type="number"
                min={0}
                max={9}
                step={0.5}
                value={pronunciationBand}
                onChange={(event) => setPronunciationBand(event.target.value)}
              />
            </div>
          </div>
        </div>

        <Button size="sm" onClick={handleSave} disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Save review
        </Button>
      </CardContent>
    </Card>
  );
}
