"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { fullMockBasicsSchema, type FullMockBasicsFormInput } from "@/lib/validations/full-mock";
import { IMAGE_INPUT_ACCEPT, validateImageFile } from "@/lib/uploads/image-constraints";
import {
  createFullMockTestAction,
  updateFullMockBasicsAction,
  uploadFullMockCoverImageAction,
} from "@/actions/full-mock-tests.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function BasicsStep({
  fullMockTestId,
  initial,
  onCreated,
  onSaved,
}: {
  fullMockTestId?: string;
  initial?: {
    title: string;
    description: string | null;
    coverImagePath: string | null;
    estimatedBandMin: number | null;
    estimatedBandMax: number | null;
  };
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const [coverPath, setCoverPath] = useState<string | null>(initial?.coverImagePath ?? null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FullMockBasicsFormInput>({
    resolver: zodResolver(fullMockBasicsSchema),
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? undefined,
      estimatedBandMin: initial?.estimatedBandMin ?? undefined,
      estimatedBandMax: initial?.estimatedBandMax ?? undefined,
    },
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadFullMockCoverImageAction(formData);
    setUploading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setCoverPath(result.path ?? null);
    toast.success("Cover image uploaded.");
  }

  async function onSubmit(values: FullMockBasicsFormInput) {
    setSubmitting(true);
    const payload = { ...values, coverImagePath: coverPath ?? undefined };

    if (fullMockTestId) {
      const result = await updateFullMockBasicsAction(fullMockTestId, payload);
      setSubmitting(false);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved.");
      onSaved?.();
    } else {
      const result = await createFullMockTestAction(payload);
      setSubmitting(false);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Full mock test created.");
      if (result.fullMockTestId) onCreated?.(result.fullMockTestId);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" placeholder="Full IELTS Mock Exam — Set 1" {...register("title")} />
        {errors.title && <p className="text-destructive text-xs">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea id="description" rows={3} placeholder="A short note for students…" {...register("description")} />
      </div>

      <div className="space-y-1.5">
        <Label>Cover image (optional)</Label>
        <input ref={fileInputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleFileChange} />
        <div className="flex items-center gap-3">
          <div className="bg-secondary relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl">
            {coverPath ? (
              <Image src={coverPath} alt="" fill sizes="64px" className="object-cover" unoptimized />
            ) : (
              <ImageIcon className="text-muted-foreground size-6" strokeWidth={1.5} />
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {coverPath ? "Replace" : "Upload"}
            </Button>
            {coverPath && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setCoverPath(null)}>
                <X className="size-3.5" /> Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="estimatedBandMin">Estimated band — low (optional)</Label>
          <Input
            id="estimatedBandMin"
            type="number"
            step="0.5"
            min={0}
            max={9}
            placeholder="6.0"
            {...register("estimatedBandMin", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="estimatedBandMax">Estimated band — high (optional)</Label>
          <Input
            id="estimatedBandMax"
            type="number"
            step="0.5"
            min={0}
            max={9}
            placeholder="7.5"
            {...register("estimatedBandMax", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-3 text-xs">
        Shown to students on the Full Mock Tests list. Leave blank to hide the band range.
      </p>

      <Button type="submit" disabled={submitting || uploading}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {fullMockTestId ? "Save & continue" : "Create & continue"}
      </Button>
    </form>
  );
}
