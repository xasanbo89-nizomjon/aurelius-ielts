"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { saveDraftAction, submitEssayAction } from "@/actions/writing.actions";
import type { WritingTaskOption } from "@/lib/writing-tasks";
import type { DraftForEdit } from "@/lib/ai/writing";
import type { WritingTaskCategoryValue } from "@/lib/validations/writing";
import { WRITING_TASK_CATEGORY_LABELS } from "@/lib/labels";
import { useStudyHeartbeat } from "@/hooks/use-study-heartbeat";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TaskTypeValue = "Task 1" | "Task 2";

function taskTypeForTask(task: WritingTaskOption): TaskTypeValue {
  return task.taskNumber === "TASK_1" ? "Task 1" : "Task 2";
}

export function WritingSubmissionForm({
  tasks,
  draft,
  initialTaskId,
}: {
  tasks: WritingTaskOption[];
  draft: DraftForEdit | null;
  /** Preselects a task bank entry, e.g. arriving from "Open" on /student/writing/tasks. Ignored once a draft is loaded (the draft's own task wins). */
  initialTaskId?: string;
}) {
  const router = useRouter();
  useStudyHeartbeat("WRITING");

  const initialTask = draft?.taskId
    ? tasks.find((t) => t.id === draft.taskId)
    : initialTaskId
      ? tasks.find((t) => t.id === initialTaskId)
      : undefined;
  const [mode, setMode] = useState<"bank" | "custom">(
    draft ? (initialTask ? "bank" : "custom") : initialTask || tasks.length > 0 ? "bank" : "custom"
  );
  const [selectedTaskId, setSelectedTaskId] = useState(initialTask?.id ?? tasks[0]?.id ?? "");
  const [customTaskType, setCustomTaskType] = useState<TaskTypeValue>((draft?.taskType as TaskTypeValue) ?? "Task 2");
  const [customCategory, setCustomCategory] = useState<WritingTaskCategoryValue | "">((draft?.category as WritingTaskCategoryValue) ?? "");
  const [customPrompt, setCustomPrompt] = useState(!initialTask ? (draft?.prompt ?? "") : "");
  const [content, setContent] = useState(draft?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  const effective = useMemo(() => {
    if (mode === "bank" && selectedTask) {
      return {
        taskId: selectedTask.id,
        taskType: taskTypeForTask(selectedTask),
        category: selectedTask.category as WritingTaskCategoryValue,
        prompt: selectedTask.prompt,
      };
    }
    return {
      taskId: undefined,
      taskType: customTaskType,
      category: customCategory || undefined,
      prompt: customPrompt,
    };
  }, [mode, selectedTask, customTaskType, customCategory, customPrompt]);

  function buildInput() {
    return {
      submissionId: draft?.id,
      taskId: effective.taskId,
      taskType: effective.taskType,
      category: effective.category,
      prompt: effective.prompt,
      content,
    };
  }

  async function handleSaveDraft() {
    if (!effective.prompt.trim()) {
      toast.error(mode === "bank" ? "Choose a task first." : "Add the task prompt you're responding to.");
      return;
    }
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
    if (!effective.prompt.trim()) {
      toast.error(mode === "bank" ? "Choose a task first." : "Add the task prompt you're responding to.");
      return;
    }
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

  const busy = saving || submitting;

  return (
    <div className="max-w-2xl space-y-5">
      {tasks.length > 0 && (
        <Tabs value={mode} onValueChange={(value) => setMode(value as "bank" | "custom")}>
          <TabsList>
            <TabsTrigger value="bank">Choose from task bank</TabsTrigger>
            <TabsTrigger value="custom">Custom prompt</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {mode === "bank" && tasks.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="task">Task</Label>
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger id="task">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {taskTypeForTask(task)} — {WRITING_TASK_CATEGORY_LABELS[task.category]} — {task.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTask && (
            <div className="border-border/70 bg-secondary/30 space-y-1 rounded-xl border p-3 text-sm">
              <p className="whitespace-pre-wrap">{selectedTask.prompt}</p>
              {selectedTask.visualDescription && (
                <p className="text-muted-foreground text-xs">Visual: {selectedTask.visualDescription}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="taskType">Task</Label>
              <Select value={customTaskType} onValueChange={(value) => setCustomTaskType(value as TaskTypeValue)}>
                <SelectTrigger id="taskType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Task 1">Task 1</SelectItem>
                  <SelectItem value="Task 2">Task 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category (optional)</Label>
              <Select value={customCategory} onValueChange={(value) => setCustomCategory(value as WritingTaskCategoryValue)}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  {(customTaskType === "Task 1"
                    ? (["GRAPH", "TABLE", "PROCESS", "MAP"] as const)
                    : (["OPINION", "DISCUSSION", "PROBLEM_SOLUTION", "ADVANTAGES_DISADVANTAGES"] as const)
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {WRITING_TASK_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prompt">Task prompt</Label>
            <Textarea
              id="prompt"
              rows={4}
              placeholder="Paste the exact question or task you're responding to…"
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
            />
          </div>
        </>
      )}

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
