"use client";

import { useEffect, useState } from "react";
import { ClipboardPaste, ImageIcon, Plus, Trash2 } from "lucide-react";

import { GROUP_KIND_META, GROUP_KIND_ORDER, LETTERS, emptyGroup, type BuilderGroup, type BuilderPart, type GroupKind, type ModelLayout, type PreviewGroupInfo, type PreviewRow, type Skill } from "@/lib/exam/builder-model";
import type { BuilderPartInfo } from "@/lib/exam/test-builder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PassageAttachmentsManager } from "@/components/teacher/passage-attachments-manager";
import { GroupEditor } from "@/components/teacher/test-builder/group-editor";
import { FIELD, NativeSelect } from "@/components/teacher/test-builder/controls";

type Mutate = (apply: (part: BuilderPart) => void) => void;

/** The passage as paragraphs: each has its letter (A, B, C ...), exactly as the student's screen labels them. */
function PassageEditor({ part, onChange }: { part: BuilderPart; onChange: Mutate }) {
  const [paragraphs, setParagraphs] = useState(() => (part.content ? part.content.split("\n\n") : [""]));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");

  // The content changed from outside (nothing does that today, but a reload does): show it.
  useEffect(() => {
    const joined = paragraphs.filter((p) => p.trim()).join("\n\n");
    if (joined !== part.content.trim()) setParagraphs(part.content ? part.content.split("\n\n") : [""]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.content]);

  function commit(next: string[]) {
    setParagraphs(next);
    onChange((p) => void (p.content = next.filter((text) => text.trim()).join("\n\n")));
  }

  return (
    <div className="space-y-2" data-testid="passage-editor">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Passage text</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen(true)} data-testid="paste-passage">
          <ClipboardPaste className="size-3.5" /> Paste the whole passage
        </Button>
      </div>
      {paragraphs.map((text, index) => (
        <div key={index} className="flex items-start gap-2" data-testid="paragraph">
          <span className="bg-secondary mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold" aria-hidden="true">
            {paragraphs.length > 1 ? (LETTERS[index] ?? index + 1) : "·"}
          </span>
          <Textarea aria-label={`Paragraph ${LETTERS[index] ?? index + 1}`} rows={Math.min(10, Math.max(3, Math.ceil(text.length / 90)))} value={text} placeholder="Type or paste the paragraph…" onChange={(event) => commit(paragraphs.map((p, i) => (i === index ? event.target.value : p)))} data-testid="paragraph-text" />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove paragraph ${LETTERS[index] ?? index + 1}`} disabled={paragraphs.length <= 1} onClick={() => commit(paragraphs.filter((_, i) => i !== index))}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setParagraphs([...paragraphs, ""])} data-testid="add-paragraph">
        <Plus className="size-3.5" /> Add paragraph
      </Button>
      <p className="text-muted-foreground text-xs">Paragraphs are lettered for the student automatically when there is more than one.</p>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste the whole passage</DialogTitle>
            <DialogDescription>A blank line starts a new paragraph. This replaces the text above.</DialogDescription>
          </DialogHeader>
          <Textarea rows={12} value={pasted} onChange={(event) => setPasted(event.target.value)} data-testid="paste-passage-text" />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                const next = pasted.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
                commit(next.length ? next : [""]);
                setPasted("");
                setPasteOpen(false);
              }}
              data-testid="paste-passage-apply"
            >
              Use this text
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PartEditor({
  testId,
  part,
  partIndex,
  skill,
  layout,
  previews,
  info,
  onChange,
  onGroupChange,
  onMoveGroup,
  onDeleteGroup,
  onAddGroup,
  onRemove,
}: {
  testId: string;
  part: BuilderPart;
  partIndex: number;
  skill: Skill;
  layout: ModelLayout["parts"][number];
  previews: Map<string, { rows: PreviewRow[]; info: PreviewGroupInfo }>;
  info: BuilderPartInfo | undefined;
  onChange: Mutate;
  onGroupChange: (groupIndex: number, apply: (group: BuilderGroup) => void) => void;
  onMoveGroup: (groupIndex: number, direction: "up" | "down") => void;
  onDeleteGroup: (groupIndex: number) => void;
  onAddGroup: (group: BuilderGroup) => void;
  /** Phase Q - a custom test may drop a part (asks first when it has questions). Absent: the part is part of the official layout. */
  onRemove?: () => void;
}) {
  const [kind, setKind] = useState<GroupKind>("TRUE_FALSE_NOT_GIVEN");
  const name = skill === "LISTENING" ? `Part ${partIndex + 1}` : `Passage ${partIndex + 1}`;
  const domId = part.passageId ?? part.key;

  return (
    <section id={`focus-part-${domId}`} className="scroll-mt-24 space-y-5" data-testid="part" data-part-index={partIndex}>
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-medium">{name}</h2>
        <span className="text-muted-foreground text-sm tabular-nums" data-testid="part-range">
          {layout.count > 0 ? `Questions ${layout.first}–${layout.last} (${layout.count})` : "No questions yet"}
        </span>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive ml-auto" onClick={onRemove} data-testid="remove-part">
            <Trash2 className="size-3.5" /> Remove this {skill === "LISTENING" ? "part" : "passage"}
          </Button>
        )}
      </header>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor={`title-${domId}`}>
          {skill === "LISTENING" ? "Part title" : "Passage title"}
        </label>
        <input id={`title-${domId}`} className={FIELD} value={part.title} onChange={(event) => onChange((p) => void (p.title = event.target.value))} data-testid="part-title" />
      </div>

      {skill === "READING" ? (
        <PassageEditor part={part} onChange={onChange} />
      ) : (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor={`transcript-${domId}`}>
            Transcript (optional - shown to students in the review after the test)
          </label>
          <Textarea id={`transcript-${domId}`} rows={4} value={part.content} onChange={(event) => onChange((p) => void (p.content = event.target.value))} data-testid="transcript" />
        </div>
      )}

      {part.passageId && (
        <details className="border-border/70 rounded-xl border px-3 py-2" data-testid="pictures">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <ImageIcon className="size-4" /> Pictures (charts, maps, diagrams){info?.attachments.length ? ` - ${info.attachments.length}` : ""}
          </summary>
          <div className="pt-3">
            <PassageAttachmentsManager passageId={part.passageId} testId={testId} attachments={(info?.attachments ?? []).map((a) => ({ id: a.id, type: a.type as "IMAGE", imagePath: a.imagePath, caption: a.caption }))} />
          </div>
        </details>
      )}

      <div className="space-y-4">
        {part.groups.map((group, groupIndex) => (
          <GroupEditor
            key={group.key}
            group={group}
            layout={layout.groups[groupIndex]}
            preview={previews.get(group.key)}
            skill={skill}
            domId={group.groupId ?? group.key}
            canMoveUp={groupIndex > 0}
            canMoveDown={groupIndex < part.groups.length - 1}
            onChange={(apply) => onGroupChange(groupIndex, apply)}
            onMove={(direction) => onMoveGroup(groupIndex, direction)}
            onDelete={() => onDeleteGroup(groupIndex)}
          />
        ))}

        <div className="border-border/70 flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3" data-testid="add-group">
          <NativeSelect aria-label="Question type" className="w-72" value={kind} onChange={(event) => setKind(event.target.value as GroupKind)} data-testid="add-group-kind">
            {GROUP_KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {GROUP_KIND_META[k].label}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" onClick={() => onAddGroup(emptyGroup(kind, skill))} data-testid="add-group-button">
            <Plus className="size-4" /> Add question group
          </Button>
        </div>
      </div>
    </section>
  );
}
