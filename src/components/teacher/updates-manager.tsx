"use client";

import { useState, useTransition } from "react";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteUpdateAction, setUpdateStatusAction } from "@/actions/update.actions";
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
import { UpdateEditorDialog, type ExistingUpdate } from "@/components/teacher/update-editor-dialog";

export type UpdateRecord = ExistingUpdate & {
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: string | null;
  createdAt: string;
};

const STATUS_VARIANT = {
  DRAFT: "outline",
  PUBLISHED: "success",
  ARCHIVED: "outline",
} as const;

export function UpdatesManager({ updates }: { updates: UpdateRecord[] }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ExistingUpdate | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<UpdateRecord | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(undefined);
    setEditorOpen(true);
  }

  function openEdit(update: UpdateRecord) {
    setEditing(update);
    setEditorOpen(true);
  }

  function setStatus(id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
    startTransition(async () => {
      const result = await setUpdateStatusAction(id, status);
      if (!result.success) toast.error(result.error);
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteUpdateAction(id);
      if (!result.success) toast.error(result.error);
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" /> New update
        </Button>
      </div>

      {updates.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No updates yet"
          description="Post your first update to let students know what's new."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> New update
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {updates.map((update) => (
            <Card key={update.id} className="py-4">
              <CardContent className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{update.title}</p>
                    <Badge variant={STATUS_VARIANT[update.status]}>{update.status.toLowerCase()}</Badge>
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-xs">{update.content}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {update.status !== "PUBLISHED" && (
                    <Button variant="outline" size="sm" onClick={() => setStatus(update.id, "PUBLISHED")} disabled={pending}>
                      Publish
                    </Button>
                  )}
                  {update.status === "PUBLISHED" && (
                    <Button variant="outline" size="sm" onClick={() => setStatus(update.id, "ARCHIVED")} disabled={pending}>
                      Archive
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(update)}
                    disabled={pending}
                    aria-label="Edit update"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(update)}
                    disabled={pending}
                    aria-label="Delete update"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UpdateEditorDialog open={editorOpen} onOpenChange={setEditorOpen} existingUpdate={editing} />

      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this update?</DialogTitle>
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
