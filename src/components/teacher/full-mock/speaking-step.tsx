"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { deleteFullMockSpeakingTaskAction } from "@/actions/full-mock-tests.actions";
import { SpeakingTaskDialog, type ExistingFullMockSpeakingTask } from "@/components/teacher/full-mock/speaking-task-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type FullMockSpeakingSectionRow = {
  id: string;
  speakingTask: { id: string; title: string; part: number; prompt: string };
};

const PART_TITLE: Record<1 | 2 | 3, string> = {
  1: "Part 1 — Introduction & Interview",
  2: "Part 2 — Long Turn (Cue Card)",
  3: "Part 3 — Discussion",
};

export function SpeakingStep({
  fullMockTestId,
  sections,
  onSaved,
  onContinue,
}: {
  fullMockTestId: string;
  sections: FullMockSpeakingSectionRow[];
  onSaved: () => void;
  onContinue: () => void;
}) {
  const [dialogPart, setDialogPart] = useState<1 | 2 | 3 | null>(null);
  const [editingSection, setEditingSection] = useState<FullMockSpeakingSectionRow | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const byPart = (part: 1 | 2 | 3) => sections.filter((s) => s.speakingTask.part === part);

  async function handleDelete(sectionId: string) {
    setDeleting(sectionId);
    const result = await deleteFullMockSpeakingTaskAction(fullMockTestId, sectionId);
    setDeleting(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Removed.");
    onSaved();
  }

  function openAdd(part: 1 | 2 | 3) {
    setEditingSection(null);
    setDialogPart(part);
  }

  function openEdit(part: 1 | 2 | 3, section: FullMockSpeakingSectionRow) {
    setEditingSection(section);
    setDialogPart(part);
  }

  const hasPart1 = byPart(1).length > 0;
  const hasPart2 = byPart(2).length > 0;
  const hasPart3 = byPart(3).length > 0;

  return (
    <div className="max-w-xl space-y-5">
      {([1, 2, 3] as const).map((part) => {
        const items = byPart(part);
        return (
          <div key={part} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{PART_TITLE[part]}</span>
              {(part !== 2 || items.length === 0) && (
                <Button type="button" size="sm" variant="outline" onClick={() => openAdd(part)}>
                  <Plus className="size-3.5" /> {part === 2 ? "Add cue card" : "Add question"}
                </Button>
              )}
            </div>

            {items.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nothing added yet.</p>
            ) : (
              <div className="space-y-2">
                {items.map((section) => (
                  <Card key={section.id}>
                    <CardContent className="space-y-1.5 py-3.5">
                      <p className="text-sm font-medium">{section.speakingTask.title}</p>
                      <p className="text-muted-foreground line-clamp-2 text-xs whitespace-pre-line">{section.speakingTask.prompt}</p>
                      <div className="flex gap-2 pt-0.5">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEdit(part, section)}>
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Button onClick={onContinue} disabled={!hasPart1 || !hasPart2 || !hasPart3}>
        Continue
      </Button>

      {dialogPart && (
        <SpeakingTaskDialog
          open
          onOpenChange={(open) => !open && setDialogPart(null)}
          fullMockTestId={fullMockTestId}
          part={dialogPart}
          existing={
            editingSection
              ? ({ sectionId: editingSection.id, title: editingSection.speakingTask.title, prompt: editingSection.speakingTask.prompt } satisfies ExistingFullMockSpeakingTask)
              : undefined
          }
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
