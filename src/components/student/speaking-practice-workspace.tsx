"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveSpeakingDraftAction, submitSpeakingAnswerAction } from "@/actions/speaking-practice.actions";
import { ExamTimer } from "@/components/exam/exam-timer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const AUTOSAVE_DEBOUNCE_MS = 1500;
const PART_2_PREP_SECONDS = 60;
const PART_2_SPEAKING_SECONDS = 120;

const PART_LABEL: Record<"PART_1" | "PART_2" | "PART_3", string> = {
  PART_1: "Part 1 — Introduction",
  PART_2: "Part 2 — Cue Card",
  PART_3: "Part 3 — Discussion",
};

export function SpeakingPracticeWorkspace({
  attemptId,
  part,
  promptTitle,
  promptText,
  cueCardBulletPoints,
  cueCardFollowUp,
  initialContent,
  nextAttemptId,
  remainingSequence,
}: {
  attemptId: string;
  part: "PART_1" | "PART_2" | "PART_3";
  promptTitle: string;
  promptText: string;
  cueCardBulletPoints: string[] | null;
  cueCardFollowUp: string | null;
  initialContent: string;
  nextAttemptId: string | null;
  remainingSequence: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [phase, setPhase] = useState<"PREP" | "ANSWERING">(part === "PART_2" ? "PREP" : "ANSWERING");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (part === "PART_2") return;
    const interval = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [part]);

  const scheduleSave = useCallback(
    (value: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setSaving(true);
        void saveSpeakingDraftAction({ attemptId, content: value }).finally(() => setSaving(false));
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [attemptId]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  function handleChange(value: string) {
    setContent(value);
    scheduleSave(value);
  }

  function handleManualSave() {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaving(true);
    void saveSpeakingDraftAction({ attemptId, content }).finally(() => {
      setSaving(false);
      toast.success("Draft saved.");
    });
  }

  async function handleSubmit() {
    if (!content.trim()) {
      toast.error("Write your answer first.");
      return;
    }
    setSubmitting(true);
    const result = await submitSpeakingAnswerAction({ attemptId, content });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const params = new URLSearchParams();
    if (nextAttemptId) {
      params.set("next", nextAttemptId);
      if (remainingSequence) params.set("sequence", remainingSequence);
    }
    const suffix = params.toString();
    router.push(`/student/speaking-practice/attempt/${attemptId}/results${suffix ? `?${suffix}` : ""}`);
  }

  const wordCount = content.trim().length > 0 ? content.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = content.length;

  return (
    <div className="space-y-5 pb-24 sm:pb-6">
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{PART_LABEL[part]}</Badge>
            {part === "PART_2" && (
              <ExamTimer
                durationSeconds={phase === "PREP" ? PART_2_PREP_SECONDS : PART_2_SPEAKING_SECONDS}
                onExpire={() => {
                  if (phase === "PREP") {
                    setPhase("ANSWERING");
                    toast.info("Preparation time's up — start writing your answer.");
                  } else {
                    toast.info("2 minutes reached — feel free to wrap up and submit.");
                  }
                }}
              />
            )}
          </div>

          <div>
            <h1 className="font-display text-lg font-medium sm:text-xl">{promptTitle}</h1>
            <p className="mt-1 text-sm whitespace-pre-wrap sm:text-base">{promptText}</p>
            {cueCardBulletPoints && cueCardBulletPoints.length > 0 && (
              <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
                {cueCardBulletPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
            {cueCardFollowUp && <p className="text-muted-foreground mt-2 text-sm italic">{cueCardFollowUp}</p>}
          </div>
        </CardContent>
      </Card>

      {part === "PART_2" && phase === "PREP" ? (
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="space-y-2 py-8 text-center">
            <p className="font-display text-lg font-medium">Take a minute to think</p>
            <p className="text-muted-foreground text-sm">Your answer box unlocks automatically once preparation time is up.</p>
            <Button variant="outline" size="sm" onClick={() => setPhase("ANSWERING")}>
              Skip preparation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={content}
            onChange={(event) => handleChange(event.target.value)}
            placeholder="Type your answer here…"
            rows={12}
            className="min-h-64 text-base"
            autoFocus
          />
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>{wordCount} words</span>
            <span>{charCount} characters</span>
            {part !== "PART_2" && <span>{Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")} elapsed</span>}
            <span className="flex items-center gap-1">
              {saving && <Loader2 className="size-3 animate-spin" />}
              {saving ? "Saving…" : "Autosaved"}
            </span>
          </div>
        </div>
      )}

      {/* Desktop actions */}
      <div className="hidden items-center gap-2 sm:flex">
        <Button variant="outline" onClick={handleManualSave} disabled={saving || submitting}>
          Save Draft
        </Button>
        <Button onClick={handleSubmit} disabled={submitting || phase === "PREP"}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Submit for Feedback
        </Button>
      </div>

      {/* Mobile: sticky submit bar (Part 12) */}
      <div className="border-border/70 bg-background/95 fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t p-3 backdrop-blur-sm sm:hidden">
        <Button variant="outline" onClick={handleManualSave} disabled={saving || submitting} className="flex-1">
          Save
        </Button>
        <Button onClick={handleSubmit} disabled={submitting || phase === "PREP"} className="flex-1">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Submit
        </Button>
      </div>
    </div>
  );
}
