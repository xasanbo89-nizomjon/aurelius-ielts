"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createWritingTaskAction, updateWritingTaskAction } from "@/actions/writing-tasks.actions";
import { TASK_1_CATEGORIES, TASK_2_CATEGORIES, type WritingTaskCategoryValue } from "@/lib/validations/writing";
import { WRITING_TASK_CATEGORY_LABELS } from "@/lib/labels";
import type { StudentOption } from "@/lib/teacher-students";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

type TaskNumberValue = "TASK_1" | "TASK_2";

export type ExistingWritingTask = {
  id: string;
  title: string;
  taskNumber: TaskNumberValue;
  category: WritingTaskCategoryValue;
  prompt: string;
  visualDescription: string | null;
  targetBand: number | null;
  dueDate: Date | null;
  assignedStudentIds: string[];
};

/** yyyy-mm-dd for an <input type="date"> value — local calendar date, not UTC-shifted. */
function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function WritingTaskEditorDialog({
  open,
  onOpenChange,
  existingTask,
  students,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTask?: ExistingWritingTask;
  students: StudentOption[];
}) {
  const [title, setTitle] = useState("");
  const [taskNumber, setTaskNumber] = useState<TaskNumberValue>("TASK_2");
  const [category, setCategory] = useState<WritingTaskCategoryValue>("OPINION");
  const [prompt, setPrompt] = useState("");
  const [visualDescription, setVisualDescription] = useState("");
  const [targetBand, setTargetBand] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const categoryOptions = taskNumber === "TASK_1" ? TASK_1_CATEGORIES : TASK_2_CATEGORIES;

  useEffect(() => {
    if (!open) return;
    setTitle(existingTask?.title ?? "");
    setTaskNumber(existingTask?.taskNumber ?? "TASK_2");
    setCategory(existingTask?.category ?? "OPINION");
    setPrompt(existingTask?.prompt ?? "");
    setVisualDescription(existingTask?.visualDescription ?? "");
    setTargetBand(existingTask?.targetBand != null ? String(existingTask.targetBand) : "");
    setDueDate(toDateInputValue(existingTask?.dueDate ?? null));
    setAssignedStudentIds(existingTask?.assignedStudentIds ?? []);
  }, [open, existingTask]);

  function handleTaskNumberChange(value: TaskNumberValue) {
    setTaskNumber(value);
    const validCategories = value === "TASK_1" ? TASK_1_CATEGORIES : TASK_2_CATEGORIES;
    if (!(validCategories as readonly string[]).includes(category)) {
      setCategory(validCategories[0]);
    }
  }

  function toggleStudent(studentId: string, checked: boolean) {
    setAssignedStudentIds((prev) => (checked ? [...prev, studentId] : prev.filter((id) => id !== studentId)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    const input = {
      title,
      taskNumber,
      category,
      prompt,
      visualDescription: visualDescription.trim() || undefined,
      targetBand: targetBand.trim() ? Number(targetBand) : undefined,
      dueDate: dueDate.trim() ? new Date(`${dueDate}T00:00:00`) : undefined,
      assignedStudentIds,
    };
    const result = existingTask
      ? await updateWritingTaskAction(existingTask.id, input)
      : await createWritingTaskAction(input);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(existingTask ? "Assignment updated." : "Assignment created as a draft.");
    onOpenChange(false);
  }

  const canSave = title.trim() && prompt.trim() && assignedStudentIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingTask ? "Edit writing assignment" : "New writing assignment"}</DialogTitle>
          <DialogDescription>
            Publish it separately when you&apos;re ready for the assigned students to see it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Line Graph — Internet Usage by Age Group"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-number">Task</Label>
              <Select value={taskNumber} onValueChange={(value) => handleTaskNumberChange(value as TaskNumberValue)}>
                <SelectTrigger id="task-number">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TASK_1">Task 1</SelectItem>
                  <SelectItem value="TASK_2">Task 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-category">Category</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as WritingTaskCategoryValue)}>
                <SelectTrigger id="task-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {WRITING_TASK_CATEGORY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-prompt">Prompt</Label>
            <Textarea
              id="task-prompt"
              rows={5}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Write the exact task question students will respond to…"
            />
          </div>

          {taskNumber === "TASK_1" && (
            <div className="space-y-1.5">
              <Label htmlFor="task-visual">Visual description (optional)</Label>
              <Textarea
                id="task-visual"
                rows={3}
                value={visualDescription}
                onChange={(event) => setVisualDescription(event.target.value)}
                placeholder="Describe the graph, table, process, or map students should interpret…"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-target-band">Target band (optional)</Label>
              <Input
                id="task-target-band"
                type="number"
                min={0}
                max={9}
                step={0.5}
                value={targetBand}
                onChange={(event) => setTargetBand(event.target.value)}
                placeholder="6.5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due-date">Deadline</Label>
              <Input id="task-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Assigned students</Label>
              {students.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-accent text-xs font-medium hover:underline"
                    onClick={() => setAssignedStudentIds(students.map((s) => s.id))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground text-xs font-medium hover:underline"
                    onClick={() => setAssignedStudentIds([])}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            {students.length === 0 ? (
              <p className="text-muted-foreground text-sm">You don&apos;t have any students assigned to you yet.</p>
            ) : (
              <div className="border-border/70 max-h-48 space-y-2 overflow-y-auto rounded-xl border p-3">
                {students.map((student) => (
                  <label key={student.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <Checkbox
                      checked={assignedStudentIds.includes(student.id)}
                      onCheckedChange={(checked) => toggleStudent(student.id, checked === true)}
                    />
                    <span className="min-w-0 truncate">{student.name ?? student.email}</span>
                  </label>
                ))}
              </div>
            )}
            {students.length > 0 && assignedStudentIds.length === 0 && (
              <p className="text-destructive text-xs">Assign at least one student.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !canSave}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
