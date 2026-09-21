"use client";

import { useState, useTransition } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deletePassageAction } from "@/actions/test-management.actions";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";
import { Button } from "@/components/ui/button";
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
import { PassageEditorDialog, type ExistingPassage } from "@/components/teacher/passage-editor-dialog";

export function PassagesManager({
  testId,
  testType,
  passages,
}: {
  testId: string;
  testType: "READING" | "LISTENING";
  passages: ExistingPassage[];
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPassage, setEditingPassage] = useState<ExistingPassage | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ExistingPassage | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditingPassage(undefined);
    setEditorOpen(true);
  }

  function openEdit(passage: ExistingPassage) {
    setEditingPassage(passage);
    setEditorOpen(true);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deletePassageAction(id, testId);
      if (!result.success) toast.error(result.error);
    });
  }

  const label = testType === "LISTENING" ? "section" : "passage";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-medium tracking-tight capitalize">{label}s</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" /> Add {label}
        </Button>
      </div>

      {passages.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={`No ${label}s yet`}
          description={`Add your first ${label} to start building questions.`}
        />
      ) : (
        <div className="space-y-3">
          {passages.map((passage, index) => (
            <Card key={passage.id} className="py-4">
              <CardContent className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium">
                    {index + 1}. {passage.title}
                  </p>
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {testType === "LISTENING"
                      ? resolvePassageAudioSrc(passage)
                        ? "Audio uploaded"
                        : "No audio set"
                      : passage.content || "No text yet"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(passage)}
                    aria-label={`Edit ${passage.title}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(passage)}
                    aria-label={`Delete ${passage.title}`}
                    disabled={pending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PassageEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        testId={testId}
        testType={testType}
        existingPassage={editingPassage}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {label}?</DialogTitle>
            <DialogDescription>
              This also deletes every question attached to it. This can&apos;t be undone.
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
