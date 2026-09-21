"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, NotebookPen, Trash2 } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/dashboard/empty-state";

export type ExamNote = { id: string; content: string };

export function NotesDrawer({
  open,
  onOpenChange,
  notes,
  draft,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notes: ExamNote[];
  draft: string;
  onSave: (content: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
}) {
  const [newContent, setNewContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setNewContent(draft);
  }, [open, draft]);

  function handleSave() {
    const content = newContent.trim();
    if (!content) return;
    startTransition(async () => {
      await onSave(content);
      setNewContent("");
    });
  }

  function handleDelete(noteId: string) {
    setDeletingId(noteId);
    startTransition(async () => {
      await onDelete(noteId);
      setDeletingId(null);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-card w-full max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Notes</SheetTitle>
          <SheetDescription>Scratch notes for this passage — visible only to you.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
          <div className="space-y-2">
            <Textarea
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
              placeholder="Jot down a thought about this passage…"
              rows={4}
            />
            <Button size="sm" onClick={handleSave} disabled={pending || !newContent.trim()}>
              {pending && !deletingId && <Loader2 className="size-4 animate-spin" />}
              Add note
            </Button>
          </div>

          {notes.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="No notes yet"
              description="Select text in the passage and choose “Add note”, or write one above."
            />
          ) : (
            <ul className="space-y-2.5">
              {notes.map((note) => (
                <li key={note.id} className="bg-secondary/50 group flex items-start gap-2 rounded-xl px-3.5 py-3">
                  <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap">{note.content}</p>
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    disabled={pending}
                    aria-label="Delete note"
                    className="text-muted-foreground hover:text-destructive focus-visible:text-destructive shrink-0 rounded-md p-1 outline-none"
                  >
                    {deletingId === note.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
