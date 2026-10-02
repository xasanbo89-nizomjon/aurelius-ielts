"use client";

import { useState, useTransition } from "react";
import { BookOpen, Pencil, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { deletePassageAction, removePassageAudioAction, removeTestAudioAction } from "@/actions/test-management.actions";
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
  // Phase B — removing a recording: one section's, or every section's at once.
  const [audioTarget, setAudioTarget] = useState<ExistingPassage | "all" | null>(null);
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

  function confirmRemoveAudio() {
    if (!audioTarget) return;
    const target = audioTarget;
    setAudioTarget(null);
    startTransition(async () => {
      const result = target === "all" ? await removeTestAudioAction(testId) : await removePassageAudioAction(target.id, testId);
      if (!result.success) toast.error(result.error);
      else toast.success(target === "all" ? "Audio removed from every section." : "Audio removed.");
    });
  }

  const label = testType === "LISTENING" ? "section" : "passage";
  const sectionsWithAudio = passages.filter((passage) => resolvePassageAudioSrc(passage)).length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-medium tracking-tight capitalize">{label}s</h2>
        <div className="flex items-center gap-2">
          {testType === "LISTENING" && sectionsWithAudio > 0 && (
            <Button size="sm" variant="outline" onClick={() => setAudioTarget("all")} disabled={pending}>
              <VolumeX className="size-4" /> Remove all audio
            </Button>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Add {label}
          </Button>
        </div>
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
                  {testType === "LISTENING" && resolvePassageAudioSrc(passage) && (
                    <Button variant="ghost" size="icon" onClick={() => setAudioTarget(passage)} aria-label={`Remove audio from ${passage.title}`} disabled={pending}>
                      <Volume2 className="size-4" />
                    </Button>
                  )}
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

      <Dialog open={!!audioTarget} onOpenChange={(next) => !next && setAudioTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{audioTarget === "all" ? "Remove the audio from every section?" : "Remove this section's audio?"}</DialogTitle>
            <DialogDescription>
              The recording file is deleted from storage (a recording shared with other sections stays until the last one using it is removed). Students can&apos;t take a
              Listening test without audio, so this is refused while the test is published or part of a published Full Mock. This can&apos;t be undone — upload the file again to replace it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmRemoveAudio}>
              Remove audio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
