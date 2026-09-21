"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Target } from "lucide-react";
import { toast } from "sonner";

import { saveDraftAction, submitEssayAction } from "@/actions/writing.actions";
import type { AssignedWritingTask } from "@/lib/writing-tasks";
import type { DraftForEdit } from "@/lib/ai/writing";
import { WRITING_TASK_CATEGORY_LABELS, WRITING_TASK_NUMBER_LABELS } from "@/lib/labels";
import { useStudyHeartbeat } from "@/hooks/use-study-heartbeat";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Architecture Fix — a student responds to a real, teacher-assigned task
 * only. No task/category picker, no editable prompt: the assignment's
 * title/prompt/category/deadline are read-only, exactly as the teacher set
 * them. The server independently re-derives all of this from `task.id`
 * anyway (see src/lib/ai/writing.ts saveDraft/submitEssay) — this component
 * never sends assignment metadata, only the essay content.
 */
export function WritingSubmissionForm({ task, draft }: { task: AssignedWritingTask; draft: DraftForEdit | null }) {
  const router = useRouter();
  useStudyHeartbeat("WRITING");

  const [content, setContent] = useState(draft?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const busy = saving || submitting;

  function buildInput() {
    return { submissionId: draft?.id, taskId: task.id, content };
  }

  async function handleSaveDraft() {
    setSaving(true);
    const result = await saveDraftAction(buildInput());
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Draft saved.");
    router.replace(`/student/writing/new?draftId=${result.submissionId}`);
  }

  async function handleSubmit() {
    if (content.trim().length < 50) {
      toast.error("Your response should be at least 50 characters.");
      return;
    }

    setSubmitting(true);
    const result = await submitEssayAction(buildInput());
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    if (result.analysisWarning) {
      toast.warning(result.analysisWarning);
    } else {
      toast.success("Submitted — your AI analysis is ready.");
    }
    router.push(`/student/writing/${result.submissionId}`);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-medium tracking-tight">{task.title}</h2>
            <Badge variant="outline">{WRITING_TASK_NUMBER_LABELS[task.taskNumber]}</Badge>
            <Badge variant="outline">{WRITING_TASK_CATEGORY_LABELS[task.category]}</Badge>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.prompt}</p>
          {task.visualDescription && (
            <p className="text-muted-foreground text-xs">Visual: {task.visualDescription}</p>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {task.dueDate && (
              <span className="flex items-center gap-1">
                <CalendarClock className="size-3.5" aria-hidden="true" /> Due {task.dueDate.toLocaleDateString()}
              </span>
            )}
            {task.targetBand != null && (
              <span className="flex items-center gap-1">
                <Target className="size-3.5" aria-hidden="true" /> Target band {task.targetBand.toFixed(1)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="content">Your response</Label>
          <span className="text-muted-foreground text-xs tabular-nums">{wordCount} words</span>
        </div>
        <Textarea
          id="content"
          rows={16}
          placeholder="Write your response here…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={busy}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save Draft
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={busy}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Submit for AI Feedback
        </Button>
      </div>
    </div>
  );
}
