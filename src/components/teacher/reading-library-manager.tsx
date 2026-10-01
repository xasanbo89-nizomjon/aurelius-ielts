"use client";

import { useState, useTransition } from "react";
import { Archive, BookOpen, Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ArticleStatus } from "@prisma/client";

import { deleteReadingLibraryItemAction, setReadingLibraryItemStatusAction } from "@/actions/reading-library.actions";
import { ARTICLE_DIFFICULTY_LABELS } from "@/lib/labels";
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
import { ReadingLibraryItemEditorDialog, type ExistingReadingLibraryItem } from "@/components/teacher/reading-library-item-editor-dialog";

export type ReadingLibraryItemRow = ExistingReadingLibraryItem & {
  status: ArticleStatus;
  bookmarkCount: number;
};

export function ReadingLibraryManager({ items }: { items: ReadingLibraryItemRow[] }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ReadingLibraryItemRow | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ReadingLibraryItemRow | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setEditing(undefined);
    setEditorOpen(true);
  }

  function openEdit(item: ReadingLibraryItemRow) {
    setEditing(item);
    setEditorOpen(true);
  }

  function setStatus(item: ReadingLibraryItemRow, status: ArticleStatus) {
    startTransition(async () => {
      const result = await setReadingLibraryItemStatusAction(item.id, status);
      if (!result.success) toast.error(result.error);
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    startTransition(async () => {
      const result = await deleteReadingLibraryItemAction(id);
      if (!result.success) toast.error(result.error);
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" /> New reading
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No readings yet"
          description="Upload a PDF reading and set its level, category and estimated band."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> New reading
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Band</TableHead>
              <TableHead>Bookmarks</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="sr-only">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell className="text-muted-foreground">{item.category}</TableCell>
                <TableCell className="text-muted-foreground">{ARTICLE_DIFFICULTY_LABELS[item.level]}</TableCell>
                <TableCell className="text-muted-foreground">{item.estimatedBand != null ? item.estimatedBand.toFixed(1) : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{item.bookmarkCount}</TableCell>
                <TableCell>
                  <Badge variant={item.status === "PUBLISHED" ? "success" : "outline"}>{item.status === "PUBLISHED" ? "Published" : "Draft"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label={`Edit ${item.title}`}>
                      <Pencil className="size-4" />
                    </Button>
                    {item.status === "DRAFT" ? (
                      <Button variant="ghost" size="icon" onClick={() => setStatus(item, "PUBLISHED")} disabled={pending} aria-label={`Publish ${item.title}`}>
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => setStatus(item, "DRAFT")} disabled={pending} aria-label={`Unpublish ${item.title}`}>
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(item)} disabled={pending} aria-label={`Delete ${item.title}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ReadingLibraryItemEditorDialog open={editorOpen} onOpenChange={setEditorOpen} existingItem={editing} />

      <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.title}?</DialogTitle>
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
