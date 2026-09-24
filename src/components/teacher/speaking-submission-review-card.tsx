"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { addSpeakingTeacherNotesAction } from "@/actions/speaking.actions";
import { formatRelativeTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export type SpeakingSubmissionForReview = {
  id: string;
  status: "PENDING" | "IN_REVIEW" | "REVIEWED" | "DRAFT";
  bandScore: number | null;
  feedback: string | null;
  fluencyBand: number | null;
  lexicalBand: number | null;
  grammarBand: number | null;
  pronunciationBand: number | null;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  teacherNotes: string | null;
  createdAt: Date;
  student: { name: string | null; email: string };
};

function BandChip({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-secondary/50 rounded-lg px-3 py-2 text-center">
      <p className="text-muted-foreground text-[11px] font-medium">{label}</p>
      <p className="font-display text-lg font-medium tabular-nums">{value != null ? value.toFixed(1) : "—"}</p>
    </div>
  );
}

export function SpeakingSubmissionReviewCard({
  taskId,
  submission,
}: {
  taskId: string;
  submission: SpeakingSubmissionForReview;
}) {
  const [notes, setNotes] = useState(submission.teacherNotes ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSaveNotes() {
    if (!notes.trim()) {
      toast.error("Add a note before saving.");
      return;
    }

    setSubmitting(true);
    const result = await addSpeakingTeacherNotesAction(submission.id, taskId, { notes });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Note saved.");
  }

  return (
    <Card>
      <CardContent className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{submission.student.name ?? submission.student.email}</p>
            <p className="text-muted-foreground text-xs">{formatRelativeTime(submission.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <Sparkles className="size-3" /> AI Evaluated
            </Badge>
            <Badge variant={submission.status === "REVIEWED" ? "success" : "outline"}>{submission.status}</Badge>
          </div>
        </div>

        {submission.status !== "REVIEWED" ? (
          <p className="text-muted-foreground text-sm">This submission hasn&apos;t been AI-evaluated yet.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="bg-secondary text-accent flex size-12 shrink-0 items-center justify-center rounded-xl">
                <span className="font-display text-lg font-medium">{submission.bandScore != null ? submission.bandScore.toFixed(1) : "—"}</span>
              </div>
              {submission.feedback && <p className="text-muted-foreground text-sm leading-relaxed">{submission.feedback}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <BandChip label="Fluency" value={submission.fluencyBand} />
              <BandChip label="Lexical" value={submission.lexicalBand} />
              <BandChip label="Grammar" value={submission.grammarBand} />
              <BandChip label="Pronunciation" value={submission.pronunciationBand} />
            </div>

            {(submission.strengths.length > 0 || submission.weaknesses.length > 0) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {submission.strengths.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Strengths</p>
                    <ul className="space-y-1 text-sm">
                      {submission.strengths.map((item, index) => (
                        <li key={index}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {submission.weaknesses.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Weaknesses</p>
                    <ul className="space-y-1 text-sm">
                      {submission.weaknesses.map((item, index) => (
                        <li key={index}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={`teacher-notes-${submission.id}`}>Your note to this student (optional)</Label>
          <Textarea
            id={`teacher-notes-${submission.id}`}
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add a personal note on top of the AI feedback…"
          />
        </div>

        <Button size="sm" onClick={handleSaveNotes} disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Save note
        </Button>
      </CardContent>
    </Card>
  );
}
