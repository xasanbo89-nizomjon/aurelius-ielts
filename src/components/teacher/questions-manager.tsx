"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FileQuestion, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { QUESTION_TYPE_META } from "@/lib/exam/question-types";
import { numberQuestions } from "@/lib/exam/question-numbering";
import {
  deleteQuestionAction,
  deleteQuestionGroupAction,
  moveQuestionAction,
  moveQuestionGroupAction,
} from "@/actions/test-management.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
import { QuestionGroupEditorDialog, type ExistingQuestionGroup } from "@/components/teacher/question-group-editor-dialog";

export type PassageWithGroups = { id: string; title: string; questionGroups: ExistingQuestionGroup[] };

export function QuestionsManager({
  testId,
  passages,
  questions,
}: {
  testId: string;
  passages: PassageWithGroups[];
  questions: ExistingQuestion[];
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ExistingQuestion | undefined>(undefined);
  const [defaultPassageId, setDefaultPassageId] = useState<string | undefined>(undefined);
  const [defaultQuestionGroupId, setDefaultQuestionGroupId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ExistingQuestion | null>(null);

  const [groupEditorOpen, setGroupEditorOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ExistingQuestionGroup | undefined>(undefined);
  const [groupEditorPassageId, setGroupEditorPassageId] = useState<string>("");
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<ExistingQuestionGroup | null>(null);

  const [pending, startTransition] = useTransition();

  // Phase A — the teacher sees the same running question numbers (and counts) the student does: a matching / summary row covers several numbers, so a "3-row" group can really be questions 14–26. `questions` arrives in test order (orderIndex ascending), which is the order numbering must follow.
  const numberById = useMemo(() => new Map(numberQuestions(questions).map((q) => [q.id, q])), [questions]);
  const spanOf = (items: ExistingQuestion[]) => items.reduce((sum, q) => sum + (numberById.get(q.id)?.span ?? 1), 0);
  const totalQuestionCount = spanOf(questions);

  function openCreate(passageId?: string, questionGroupId?: string) {
    setEditingQuestion(undefined);
    setDefaultPassageId(passageId);
    setDefaultQuestionGroupId(questionGroupId);
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

  function openGroupCreate(passageId: string) {
    setEditingGroup(undefined);
    setGroupEditorPassageId(passageId);
    setGroupEditorOpen(true);
  }

  function openGroupEdit(passageId: string, group: ExistingQuestionGroup) {
    setEditingGroup(group);
    setGroupEditorPassageId(passageId);
    setGroupEditorOpen(true);
  }

  function confirmDeleteGroup() {
    if (!deleteGroupTarget) return;
    const id = deleteGroupTarget.id;
    setDeleteGroupTarget(null);
    startTransition(async () => {
      const result = await deleteQuestionGroupAction(id, testId);
      if (!result.success) toast.error(result.error);
    });
  }

  function moveGroup(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveQuestionGroupAction(id, testId, direction);
      if (!result.success) toast.error(result.error);
    });
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display flex items-center gap-2 text-xl font-medium tracking-tight">
          Questions
          {questions.length > 0 && (
            <Badge variant="secondary" className="text-xs font-normal">
              {totalQuestionCount} total
            </Badge>
          )}
        </h2>
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
          {passages.map((passage) => {
            const passageQuestions = questions.filter((q) => q.passageId === passage.id);
            if (passageQuestions.length === 0 && passage.questionGroups.length === 0) return null;

            const ungrouped = passageQuestions.filter(
              (q) => !q.questionGroupId || !passage.questionGroups.some((g) => g.id === q.questionGroupId)
            );
            const openValues = passage.questionGroups.map((g) => g.id).concat(ungrouped.length > 0 ? ["ungrouped"] : []);

            return (
              <div key={passage.id} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                    {passage.title}
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {spanOf(passageQuestions)} question{spanOf(passageQuestions) === 1 ? "" : "s"}
                    </Badge>
                  </h3>
                  <Button size="sm" variant="outline" onClick={() => openGroupCreate(passage.id)}>
                    <Layers className="size-3.5" /> Add group
                  </Button>
                </div>

                <Accordion type="multiple" defaultValue={openValues} className="border-border/70 rounded-xl border px-3">
                  {passage.questionGroups.map((group) => {
                    const items = passageQuestions.filter((q) => q.questionGroupId === group.id);
                    return (
                      <AccordionItem key={group.id} value={group.id}>
                        <AccordionTrigger>
                          <span className="flex items-center gap-2 text-sm font-medium">
                            Questions {group.startQuestion}-{group.endQuestion}
                            {group.title !== `Questions ${group.startQuestion}-${group.endQuestion}` && (
                              <span className="text-muted-foreground font-normal">— {group.title}</span>
                            )}
                            <Badge variant="outline" className="text-[11px] font-normal">
                              {spanOf(items)}
                            </Badge>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3">
                            {group.instructions && <p className="text-muted-foreground text-sm">{group.instructions}</p>}

                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openGroupEdit(passage.id, group);
                                }}
                              >
                                <Pencil className="size-3.5" /> Edit group
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  moveGroup(group.id, "up");
                                }}
                                disabled={pending}
                              >
                                <ArrowUp className="size-3.5" /> Move up
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  moveGroup(group.id, "down");
                                }}
                                disabled={pending}
                              >
                                <ArrowDown className="size-3.5" /> Move down
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteGroupTarget(group);
                                }}
                                disabled={pending}
                              >
                                <Trash2 className="size-3.5" /> Delete group
                              </Button>
                              <Button
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openCreate(passage.id, group.id);
                                }}
                              >
                                <Plus className="size-3.5" /> Add question here
                              </Button>
                            </div>

                            <QuestionList numberById={numberById} items={items} onEdit={openEdit} onDelete={setDeleteTarget} onMove={move} pending={pending} />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}

                  {ungrouped.length > 0 && (
                    <AccordionItem value="ungrouped">
                      <AccordionTrigger>
                        <span className="flex items-center gap-2 text-sm font-medium">
                          Ungrouped Questions
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {spanOf(ungrouped)}
                          </Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <QuestionList numberById={numberById} items={ungrouped} onEdit={openEdit} onDelete={setDeleteTarget} onMove={move} pending={pending} />
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </div>
            );
          })}

          {(() => {
            const unassigned = questions.filter((q) => !q.passageId || !passages.some((p) => p.id === q.passageId));
            if (unassigned.length === 0) return null;
            return (
              <div className="space-y-2.5">
                <h3 className="text-muted-foreground text-sm font-medium">Unassigned</h3>
                <QuestionList numberById={numberById} items={unassigned} onEdit={openEdit} onDelete={setDeleteTarget} onMove={move} pending={pending} />
              </div>
            );
          })()}
        </div>
      )}

      <QuestionEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        testId={testId}
        passages={passages}
        existingQuestion={editingQuestion}
        defaultPassageId={defaultPassageId}
        defaultQuestionGroupId={defaultQuestionGroupId}
      />

      <QuestionGroupEditorDialog
        open={groupEditorOpen}
        onOpenChange={setGroupEditorOpen}
        testId={testId}
        passageId={groupEditorPassageId}
        existingGroup={editingGroup}
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

      <Dialog open={!!deleteGroupTarget} onOpenChange={(next) => !next && setDeleteGroupTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this question group?</DialogTitle>
            <DialogDescription>
              Its questions aren&apos;t deleted — they move to &quot;Ungrouped Questions&quot;. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDeleteGroup}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function QuestionList({
  numberById,
  items,
  onEdit,
  onDelete,
  onMove,
  pending,
}: {
  numberById: Map<string, { startNumber: number; endNumber: number }>;
  items: ExistingQuestion[];
  onEdit: (question: ExistingQuestion) => void;
  onDelete: (question: ExistingQuestion) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  pending: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No questions in this group yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((question) => {
        const numbering = numberById.get(question.id);
        return (
        <Card key={question.id} id={`question-${question.id}`} className="scroll-mt-24 py-3">
          <CardContent className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {numbering && (
                  <span className="text-muted-foreground text-xs font-medium tabular-nums">
                    {numbering.startNumber === numbering.endNumber ? `Q${numbering.startNumber}` : `Q${numbering.startNumber}–${numbering.endNumber}`}
                  </span>
                )}
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
        );
      })}
    </div>
  );
}
