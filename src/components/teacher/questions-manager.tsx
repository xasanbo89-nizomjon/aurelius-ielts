"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FileQuestion, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { deleteQuestionAction, moveQuestionAction } from "@/actions/test-management.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { QuestionEditorDialog, type ExistingQuestion } from "@/components/teacher/question-editor-dialog";

export function QuestionsManager({
  testId,
  passages,
  questions,
}: {
  testId: string;
  passages: { id: string; title: string }[];
  questions: ExistingQuestion[];
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ExistingQuestion | undefined>(undefined);
  const [defaultPassageId, setDefaultPassageId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ExistingQuestion | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate(passageId?: string) {
    setEditingQuestion(undefined);
    setDefaultPassageId(passageId);
    setEditorOpen(true);
  }

  function openEdit(question: ExistingQuestion) {
    setEditingQuestion(question);
    setEditorOpen(true);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteQuestionAction(id, testId);
      if (!result.success) toast.error(result.error);
    });
  }

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveQuestionAction(id, testId, direction);
      if (!result.success) toast.error(result.error);
    });
  }

  const groups = passages
    .map((passage) => ({ passage, items: questions.filter((q) => q.passageId === passage.id) }))
    .filter((group) => group.items.length > 0);
  const unassigned = questions.filter((q) => !q.passageId || !passages.some((p) => p.id === q.passageId));

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-medium tracking-tight">Questions</h2>
        <Button size="sm" onClick={() => openCreate(passages[0]?.id)} disabled={passages.length === 0}>
          <Plus className="size-4" /> Add question
        </Button>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="No questions yet"
          description={
            passages.length === 0
              ? "Add a passage first, then start adding questions."
              : "Add your first question to this test."
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map(({ passage, items }) => (
            <div key={passage.id} className="space-y-2.5">
              <h3 className="text-muted-foreground text-sm font-medium">{passage.title}</h3>
              <QuestionList items={items} onEdit={openEdit} onDelete={setDeleteTarget} onMove={move} pending={pending} />
            </div>
          ))}
          {unassigned.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-muted-foreground text-sm font-medium">Unassigned</h3>
              <QuestionList
                items={unassigned}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onMove={move}
                pending={pending}
              />
            </div>
          )}
        </div>
      )}

      <QuestionEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        testId={testId}
        passages={passages}
        existingQuestion={editingQuestion}
        defaultPassageId={defaultPassageId}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this question?</DialogTitle>
            <DialogDescription>This can&apos;t be undone.</DialogDescription>
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

function QuestionList({
  items,
  onEdit,
  onDelete,
  onMove,
  pending,
}: {
  items: ExistingQuestion[];
  onEdit: (question: ExistingQuestion) => void;
  onDelete: (question: ExistingQuestion) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-2">
      {items.map((question) => (
        <Card key={question.id} className="py-3">
          <CardContent className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{QUESTION_TYPE_META[question.type].label}</Badge>
                <span className="text-muted-foreground text-xs">
                  {question.points} pt{question.points === 1 ? "" : "s"}
                </span>
              </div>
              <p className="line-clamp-2 text-sm">{question.prompt}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onMove(question.id, "up")}
                disabled={pending}
                aria-label="Move question up"
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onMove(question.id, "down")}
                disabled={pending}
                aria-label="Move question down"
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onEdit(question)} aria-label="Edit question">
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(question)}
                disabled={pending}
                aria-label="Delete question"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
