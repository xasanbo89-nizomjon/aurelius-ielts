"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { WritingTaskCategory, WritingTaskNumber } from "@prisma/client";

import { deleteFullMockWritingTaskAction } from "@/actions/full-mock-tests.actions";
import { WRITING_TASK_CATEGORY_LABELS } from "@/lib/labels";
import { WritingTaskDialog, type ExistingFullMockWritingTask } from "@/components/teacher/full-mock/writing-task-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type FullMockWritingSectionRow = {
  id: string;
  writingTask: {
    id: string;
    title: string;
    taskNumber: WritingTaskNumber;
    category: WritingTaskCategory;
    prompt: string;
    visualDescription: string | null;
  };
};

export function WritingStep({
  fullMockTestId,
  sections,
  onSaved,
  onContinue,
}: {
  fullMockTestId: string;
  sections: FullMockWritingSectionRow[];
  onSaved: () => void;
  onContinue: () => void;
}) {
  const [dialogTask, setDialogTask] = useState<WritingTaskNumber | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const task1 = sections.find((s) => s.writingTask.taskNumber === "TASK_1");
  const task2 = sections.find((s) => s.writingTask.taskNumber === "TASK_2");

  async function handleDelete(sectionId: string) {
    setDeleting(sectionId);
    const result = await deleteFullMockWritingTaskAction(fullMockTestId, sectionId);
    setDeleting(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Removed.");
    onSaved();
  }

  function toExisting(section?: FullMockWritingSectionRow): ExistingFullMockWritingTask | undefined {
    if (!section) return undefined;
    return {
      sectionId: section.id,
      title: section.writingTask.title,
      taskNumber: section.writingTask.taskNumber,
      category: section.writingTask.category,
      prompt: section.writingTask.prompt,
      visualDescription: section.writingTask.visualDescription,
    };
  }

  return (
    <div className="max-w-xl space-y-4">
      {([1, 2] as const).map((n) => {
        const section = n === 1 ? task1 : task2;
        const taskNumber: WritingTaskNumber = n === 1 ? "TASK_1" : "TASK_2";

        return (
          <Card key={n}>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Task {n}</span>
                {section && <Badge variant="outline">{WRITING_TASK_CATEGORY_LABELS[section.writingTask.category]}</Badge>}
              </div>

              {section ? (
                <>
                  <p className="text-sm font-medium">{section.writingTask.title}</p>
                  <p className="text-muted-foreground line-clamp-2 text-xs">{section.writingTask.prompt}</p>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setDialogTask(taskNumber)}>
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={deleting === section.id}
                      onClick={() => handleDelete(section.id)}
                    >
                      {deleting === section.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setDialogTask(taskNumber)}>
                  <Plus className="size-3.5" /> Add Task {n}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Button onClick={onContinue} disabled={!task1 || !task2}>
        Continue
      </Button>

      {dialogTask && (
        <WritingTaskDialog
          open
          onOpenChange={(open) => !open && setDialogTask(null)}
          fullMockTestId={fullMockTestId}
          taskNumber={dialogTask}
          existing={toExisting(dialogTask === "TASK_1" ? task1 : task2)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
