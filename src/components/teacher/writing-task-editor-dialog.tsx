"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { createWritingTaskAction, updateWritingTaskAction, uploadWritingTaskCoverImageAction } from "@/actions/writing-tasks.actions";
import { IMAGE_INPUT_ACCEPT, validateImageFile } from "@/lib/uploads/image-constraints";
import { TASK_1_CATEGORIES, TASK_2_CATEGORIES, type WritingTaskCategoryValue, type WritingTrainingTypeValue } from "@/lib/validations/writing";
import { WRITING_TASK_CATEGORY_LABELS } from "@/lib/labels";
import type { WritingTaskImage } from "@/lib/writing-task-image";
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
import { WritingTaskImageField } from "@/components/teacher/writing-task-image-field";
import { ShowResultsField } from "@/components/teacher/show-results-field";
import { FallbackImage } from "@/components/ui/fallback-image";

type TaskNumberValue = "TASK_1" | "TASK_2";

export type ExistingWritingTask = {
  id: string;
  title: string;
  trainingType: WritingTrainingTypeValue;
  taskNumber: TaskNumberValue;
  category: WritingTaskCategoryValue;
  prompt: string;
  visualDescription: string | null;
  /** Phase F - the Task 1 picture (its Media Library file and stored metadata), or null. */
  image: WritingTaskImage | null;
  coverImagePath: string | null;
  targetBand: number | null;
  dueDate: Date | null;
  assignedStudentIds: string[];
  /** Phase O - "Show results to students?" (null = a task made before Phase O: its results are shown). */
  showResultsToStudent: boolean | null;
  /** Phase O - the task belongs to a Full Mock: its results are never shown to students, so there is no choice to make. */
  inFullMock?: boolean;
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
  const [trainingType, setTrainingType] = useState<WritingTrainingTypeValue>("ACADEMIC");
  const [taskNumber, setTaskNumber] = useState<TaskNumberValue>("TASK_2");
  const [category, setCategory] = useState<WritingTaskCategoryValue>("OPINION");
  const [prompt, setPrompt] = useState("");
  const [visualDescription, setVisualDescription] = useState("");
  const [image, setImage] = useState<WritingTaskImage | null>(null);
  const [coverImagePath, setCoverImagePath] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [targetBand, setTargetBand] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
  // Phase O - "Show results to students?": not chosen until the teacher picks Yes or No (an older task starts unanswered too).
  const [showResults, setShowResults] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const categoryOptions = taskNumber === "TASK_1" ? TASK_1_CATEGORIES : TASK_2_CATEGORIES;

  useEffect(() => {
    if (!open) return;
    setTitle(existingTask?.title ?? "");
    setTrainingType(existingTask?.trainingType ?? "ACADEMIC");
    setTaskNumber(existingTask?.taskNumber ?? "TASK_2");
    setCategory(existingTask?.category ?? "OPINION");
    setPrompt(existingTask?.prompt ?? "");
    setVisualDescription(existingTask?.visualDescription ?? "");
    setImage(existingTask?.image ?? null);
    setCoverImagePath(existingTask?.coverImagePath ?? null);
    setTargetBand(existingTask?.targetBand != null ? String(existingTask.targetBand) : "");
    setDueDate(toDateInputValue(existingTask?.dueDate ?? null));
    setAssignedStudentIds(existingTask?.assignedStudentIds ?? []);
    setShowResults(existingTask?.showResultsToStudent ?? null);
  }, [open, existingTask]);

  async function handleCoverFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploadingCover(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadWritingTaskCoverImageAction(formData);
    setUploadingCover(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCoverImagePath(result.path ?? null);
  }

  function handleTaskNumberChange(value: TaskNumberValue) {
    setTaskNumber(value);
    const validCategories = value === "TASK_1" ? TASK_1_CATEGORIES : TASK_2_CATEGORIES;
    if (!(validCategories as readonly string[]).includes(category)) {
      setCategory(validCategories[0]);
    }
    if (value === "TASK_2") setImage(null);
  }

  function toggleStudent(studentId: string, checked: boolean) {
    setAssignedStudentIds((prev) => (checked ? [...prev, studentId] : prev.filter((id) => id !== studentId)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    const input = {
      title,
      trainingType,
      taskNumber,
      category,
      prompt,
      visualDescription: visualDescription.trim() || undefined,
      imageMediaFileId: taskNumber === "TASK_1" ? (image?.mediaFileId ?? undefined) : undefined,
      coverImagePath: coverImagePath ?? undefined,
      targetBand: targetBand.trim() ? Number(targetBand) : undefined,
      dueDate: dueDate.trim() ? new Date(`${dueDate}T00:00:00`) : undefined,
      assignedStudentIds,
      // a task of a Full Mock has no such choice
      showResultsToStudent: existingTask?.inFullMock ? undefined : (showResults ?? undefined),
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

  // Assigning students is deliberately NOT required to save: a teacher with
  // zero students currently on their roster (or who just wants to draft the
  // content first) must still be able to save — the task already starts as
  // an unpublished DRAFT that's invisible to everyone regardless, exactly
  // like an assignment with nobody picked yet. Students can be added later
  // via Edit once the roster has someone.
  const canSave = Boolean(title.trim() && prompt.trim() && (existingTask?.inFullMock || showResults !== null));

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

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-training-type">Type</Label>
              <Select value={trainingType} onValueChange={(value) => setTrainingType(value as WritingTrainingTypeValue)}>
                <SelectTrigger id="task-training-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACADEMIC">Academic</SelectItem>
                  <SelectItem value="GENERAL">General Training</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

          <div className="space-y-1.5">
            <Label>Cover image (optional)</Label>
            <input ref={coverFileInputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleCoverFileChange} />
            {coverImagePath ? (
              <div className="border-border/70 bg-secondary/20 relative w-full max-w-xs overflow-hidden rounded-xl border">
                <div className="bg-secondary relative aspect-video">
                  <FallbackImage src={coverImagePath} alt="Assignment cover" fill sizes="320px" className="object-cover" unoptimized />
                </div>
                <button
                  type="button"
                  onClick={() => setCoverImagePath(null)}
                  aria-label="Remove cover image"
                  className="bg-background/90 text-muted-foreground hover:text-destructive absolute top-1.5 right-1.5 rounded-full p-1.5"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={uploadingCover} onClick={() => coverFileInputRef.current?.click()}>
                {uploadingCover ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Upload cover image
              </Button>
            )}
            <p className="text-muted-foreground text-xs">Shown as a thumbnail in your assignment list — distinct from the Task 1 visual below.</p>
          </div>

          {taskNumber === "TASK_1" && (
            <div className="space-y-1.5">
              <Label>Picture (chart, graph, table, map, or process)</Label>
              <WritingTaskImageField value={image} onChange={setImage} disabled={submitting} />
              <p className="text-muted-foreground text-xs">Optional — shown to students above the task text. A real picture is clearer than a description.</p>
              <Label htmlFor="task-visual" className="pt-1.5">
                Visual description (optional, shown alongside or instead of the image)
              </Label>
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
              <p className="text-muted-foreground text-sm">
                You don&apos;t have any students assigned to you yet — you can still save this assignment now and pick
                students later from{" "}
                <Link href="/teacher/students" className="text-accent hover:underline">
                  Students
                </Link>
                .
              </p>
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
              <p className="text-muted-foreground text-xs">
                No students selected yet — this assignment won&apos;t be visible to anyone until you assign at least one.
              </p>
            )}
          </div>
          {!existingTask?.inFullMock && <ShowResultsField value={showResults} onChange={setShowResults} />}
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
