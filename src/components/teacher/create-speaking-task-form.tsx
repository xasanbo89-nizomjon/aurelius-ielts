"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createSpeakingTaskSchema, type CreateSpeakingTaskInput } from "@/lib/validations/speaking";
import { createSpeakingTaskAction } from "@/actions/speaking.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CreateSpeakingTaskForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateSpeakingTaskInput>({
    resolver: zodResolver(createSpeakingTaskSchema),
    defaultValues: { part: 1 },
  });

  const part = watch("part");

  async function onSubmit(values: CreateSpeakingTaskInput) {
    setSubmitting(true);
    const result = await createSpeakingTaskAction(values);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    router.push(`/teacher/speaking/${result.taskId}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" placeholder="Describe your hometown" {...register("title")} />
        {errors.title && <p className="text-destructive text-xs">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="part">Part</Label>
        <Select value={String(part)} onValueChange={(value) => setValue("part", Number(value))}>
          <SelectTrigger id="part">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Part 1 — Introduction</SelectItem>
            <SelectItem value="2">Part 2 — Cue Card</SelectItem>
            <SelectItem value="3">Part 3 — Discussion</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prompt">Prompt</Label>
        <Textarea id="prompt" rows={5} placeholder="Describe your hometown. You should say…" {...register("prompt")} />
        {errors.prompt && <p className="text-destructive text-xs">{errors.prompt.message}</p>}
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Create task
      </Button>
    </form>
  );
}
