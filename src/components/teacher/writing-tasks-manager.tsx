"use client";

import { useState, useTransition } from "react";
import { Archive, Loader2, Pencil, PenLine, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { WritingTaskStatus } from "@prisma/client";

import { deleteWritingTaskAction, setWritingTaskStatusAction } from "@/actions/writing-tasks.actions";
import { WRITING_TASK_CATEGORY_LABELS, WRITING_TASK_NUMBER_LABELS, WRITING_TASK_STATUS_LABELS, WRITING_TASK_STATUS_VARIANTS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { WritingTaskEditorDialog, type ExistingWritingTask } from "@/components/teacher/writing-task-editor-dialog";

export type WritingTaskRow = ExistingWritingTask & {
  status: WritingTaskStatus;
  submissionCount: number;
};

export function WritingTasksManager({ tasks }: { tasks: WritingTaskRow[] }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<WritingTaskRow | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<WritingTaskRow | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(undefined);
    setEditorOpen(true);
  }

  function openEdit(task: WritingTaskRow) {
    setEditing(task);
    setEditorOpen(true);
  }

  function setStatus(task: WritingTaskRow, status: WritingTaskStatus) {
    startTransition(async () => {
      const result = await setWritingTaskStatusAction(task.id, status);
      if (!result.success) toast.error(result.error);
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteWritingTaskAction(id);
      if (!result.success) toast.error(result.error);
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" /> New task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="No writing tasks yet"
          description="Create Task 1 or Task 2 prompts for your students' task bank."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> New task
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Submissions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">{task.title}</TableCell>
                <TableCell className="text-muted-foreground">{WRITING_TASK_NUMBER_LABELS[task.taskNumber]}</TableCell>
                <TableCell className="text-muted-foreground">{WRITING_TASK_CATEGORY_LABELS[task.category]}</TableCell>
                <TableCell className="text-muted-foreground">{task.dueDate ? task.dueDate.toLocaleDateString() : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{task.submissionCount}</TableCell>
                <TableCell>
                  <Badge variant={WRITING_TASK_STATUS_VARIANTS[task.status]}>{WRITING_TASK_STATUS_LABELS[task.status]}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(task)} aria-label={`Edit ${task.title}`}>
                      <Pencil className="size-4" />
                    </Button>
                    {task.status !== "PUBLISHED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setStatus(task, "PUBLISHED")}
                        disabled={pending}
                        aria-label={`Publish ${task.title}`}
                      >
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      </Button>
                    )}
                    {task.status === "PUBLISHED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setStatus(task, "ARCHIVED")}
                        disabled={pending}
                        aria-label={`Archive ${task.title}`}
                      >
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(task)}
                      disabled={pending}
                      aria-label={`Delete ${task.title}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <WritingTaskEditorDialog open={editorOpen} onOpenChange={setEditorOpen} existingTask={editing} />

      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.title}?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Tasks with real student submissions can&apos;t be deleted — archive them instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
