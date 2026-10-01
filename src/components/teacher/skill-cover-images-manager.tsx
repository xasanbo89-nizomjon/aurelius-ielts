"use client";

import { useRef, useState } from "react";
import type { SkillType } from "@prisma/client";
import { ImageIcon, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { deleteSkillCoverImageAction, uploadSkillCoverImageAction } from "@/actions/skill-cover-images.actions";
import type { SkillCoverImageRow } from "@/lib/skill-cover-images";
import { SKILL_COVER_SKILLS } from "@/lib/skill-cover-images-constants";
import { SKILL_ICONS, SKILL_LABELS } from "@/lib/labels";
import { IMAGE_INPUT_ACCEPT, validateImageFile } from "@/lib/uploads/image-constraints";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FallbackImage } from "@/components/ui/fallback-image";

const EXAMPLE_TITLES: Record<SkillType, string> = {
  READING: "Cambridge Reading Collection",
  LISTENING: "IELTS Listening Practice",
  WRITING: "Writing Task Collection",
  SPEAKING: "Speaking Practice Hub",
};

function EditDialog({
  skill,
  current,
  open,
  onOpenChange,
  onSaved,
}: {
  skill: SkillType;
  current: SkillCoverImageRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: SkillCoverImageRow) => void;
}) {
  const [title, setTitle] = useState(current?.title ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(current?.imagePath ?? null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    const validation = validateImageFile(selected);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Title must be at least 3 characters.");
      return;
    }
    if (!file && !current) {
      toast.error("Choose an image to upload.");
      return;
    }

    setSaving(true);
    const formData = new FormData();
    if (file) formData.append("file", file);
    formData.append("title", title.trim());
    formData.append("description", description.trim());

    const result = await uploadSkillCoverImageAction(skill, formData);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Cover image saved.");
    onSaved({ skill, title: title.trim(), description: description.trim() || null, imagePath: preview ?? current!.imagePath, updatedAt: new Date() });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{SKILL_LABELS[skill]} cover banner</DialogTitle>
        </DialogHeader>

        <input ref={fileInputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="bg-secondary/40 hover:bg-secondary/60 relative flex aspect-[21/9] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed transition-colors"
        >
          {preview ? (
            <FallbackImage src={preview} alt="" fill sizes="480px" className="object-cover" unoptimized />
          ) : (
            <span className="text-muted-foreground flex flex-col items-center gap-1 text-xs">
              <ImageIcon className="size-6" strokeWidth={1.5} />
              Click to choose an image
            </span>
          )}
        </button>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`skill-cover-title-${skill}`}>Title</Label>
            <Input
              id={`skill-cover-title-${skill}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={EXAMPLE_TITLES[skill]}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`skill-cover-description-${skill}`}>Description (optional)</Label>
            <Textarea
              id={`skill-cover-description-${skill}`}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Shown under the banner title…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Phase 47 — "Skill Cover Images": a real per-skill banner each teacher sets
 * for their own 4 skill landing pages. No skill shows a banner until a
 * teacher actually uploads one — never a placeholder image or example title.
 */
export function SkillCoverImagesManager({
  initial,
  canEdit,
}: {
  initial: Record<SkillType, SkillCoverImageRow | null>;
  /** Phase 47 — platform-wide, so only a Root Teacher may change these; every other teacher sees this section read-only. */
  canEdit: boolean;
}) {
  const [covers, setCovers] = useState(initial);
  const [editingSkill, setEditingSkill] = useState<SkillType | null>(null);
  const [removingSkill, setRemovingSkill] = useState<SkillType | null>(null);

  async function handleRemove(skill: SkillType) {
    setRemovingSkill(skill);
    const result = await deleteSkillCoverImageAction(skill);
    setRemovingSkill(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCovers((prev) => ({ ...prev, [skill]: null }));
    toast.success("Cover image removed.");
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-medium">Skill Cover Images</h2>
      <p className="text-muted-foreground -mt-1 text-sm">
        {canEdit
          ? "Platform-wide banners shown at the top of each skill's landing page for every student."
          : "Platform-wide banners shown to every student — only a Root Teacher can change these."}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SKILL_COVER_SKILLS.map((skill) => {
          const cover = covers[skill];
          const Icon = SKILL_ICONS[skill];
          return (
            <Card key={skill} className="overflow-hidden py-0">
              <div className={cn("relative aspect-video", !cover && "bg-secondary/40")}>
                {cover ? (
                  <FallbackImage src={cover.imagePath} alt={cover.title} fill sizes="300px" className="object-cover" unoptimized />
                ) : (
                  <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-1">
                    <Icon className="size-6" strokeWidth={1.5} />
                    <span className="text-[11px]">No banner set</span>
                  </div>
                )}
              </div>
              <CardContent className="space-y-1.5 py-3">
                <p className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide">
                  <Icon className="size-3" aria-hidden="true" /> {SKILL_LABELS[skill]}
                </p>
                <p className="truncate text-sm font-medium" title={cover?.title}>
                  {cover?.title ?? "—"}
                </p>
                {canEdit && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingSkill(skill)}>
                      {cover ? <Pencil className="size-3.5" /> : <Upload className="size-3.5" />}
                      {cover ? "Edit" : "Upload"}
                    </Button>
                    {cover && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={removingSkill === skill}
                        onClick={() => handleRemove(skill)}
                      >
                        {removingSkill === skill ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {editingSkill && (
        <EditDialog
          skill={editingSkill}
          current={covers[editingSkill]}
          open
          onOpenChange={(open) => !open && setEditingSkill(null)}
          onSaved={(row) => setCovers((prev) => ({ ...prev, [row.skill]: row }))}
        />
      )}
    </div>
  );
}
