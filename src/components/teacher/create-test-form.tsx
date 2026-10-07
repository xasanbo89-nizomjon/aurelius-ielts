"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createTestSchema, type CreateTestInput } from "@/lib/validations/test-management";
import { createBuilderTestAction } from "@/actions/test-builder.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function CreateTestForm({ defaultType = "READING" }: { defaultType?: "READING" | "LISTENING" }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateTestInput>({
    resolver: zodResolver(createTestSchema),
    defaultValues: { type: defaultType, category: "GENERAL", format: "FULL_IELTS" },
  });

  const type = watch("type");
  const category = watch("category");
  const format = watch("format") ?? "FULL_IELTS";

  async function onSubmit(values: CreateTestInput) {
    setSubmitting(true);
    // Phase L2 - the test is created with its parts (3 passages / 4 parts) already in place and opens in the structured editor.
    const result = await createBuilderTestAction({
      type: values.type,
      title: values.title,
      description: values.description,
      durationMinutes: values.durationMinutes ?? null,
      category: values.category,
      format: values.format ?? "FULL_IELTS",
      partCount: values.format === "CUSTOM" ? (values.partCount ?? (values.type === "LISTENING" ? 4 : 3)) : undefined,
    });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    router.push(`/teacher/tests/${result.testId}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" placeholder="Academic Reading — Practice Test 1" {...register("title")} />
        {errors.title && <p className="text-destructive text-xs">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea id="description" rows={3} placeholder="A short note for students…" {...register("description")} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="type">Module</Label>
          <Select value={type} onValueChange={(value) => setValue("type", value as CreateTestInput["type"])}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="READING">Reading</SelectItem>
              <SelectItem value="LISTENING">Listening</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="durationMinutes">Duration (minutes)</Label>
          <Input
            id="durationMinutes"
            type="number"
            min={1}
            placeholder={type === "LISTENING" ? "30" : "60"}
            {...register("durationMinutes", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
          />
        </div>
      </div>

      <fieldset className="border-border/70 space-y-3 rounded-xl border px-4 py-3.5" data-testid="format-choice">
        <legend className="px-1 text-sm font-medium">Test format</legend>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="radio" name="format" value="FULL_IELTS" checked={format === "FULL_IELTS"} onChange={() => setValue("format", "FULL_IELTS")} className="mt-1" data-testid="format-full" />
          <span>
            <span className="font-medium">Full IELTS test (40 questions)</span>
            <span className="text-muted-foreground block text-xs">The official layout: {type === "LISTENING" ? "4 parts" : "3 passages"}, exactly 40 questions, an IELTS band for every result. Only this kind can be used in a Full Mock.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="radio" name="format" value="CUSTOM" checked={format === "CUSTOM"} onChange={() => setValue("format", "CUSTOM")} className="mt-1" data-testid="format-custom" />
          <span>
            <span className="font-medium">Custom test (any number of questions)</span>
            <span className="text-muted-foreground block text-xs">Any number of questions and parts, numbered 1 to the last. Students get their score and percentage (for example 18/24, 75%) - no IELTS band - and it cannot be used in a Full Mock.</span>
          </span>
        </label>
        {format === "CUSTOM" && (
          <div className="space-y-1.5 pl-7">
            <Label htmlFor="partCount">Number of {type === "LISTENING" ? "parts" : "passages"} to start with</Label>
            <Input
              id="partCount"
              type="number"
              min={1}
              max={12}
              className="w-28"
              placeholder={type === "LISTENING" ? "4" : "3"}
              {...register("partCount", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })}
            />
            <p className="text-muted-foreground text-xs">You can add and remove {type === "LISTENING" ? "parts" : "passages"} later in the editor.</p>
          </div>
        )}
      </fieldset>

      <div className="border-border/70 flex items-center justify-between rounded-xl border px-4 py-3.5">
        <div className="space-y-0.5">
          <Label htmlFor="category">Cambridge Test</Label>
          <p className="text-muted-foreground text-xs">Free for every student, no subscription required.</p>
        </div>
        <Switch
          id="category"
          checked={category === "CAMBRIDGE"}
          onCheckedChange={(checked) => setValue("category", checked ? "CAMBRIDGE" : "GENERAL")}
        />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Create test
      </Button>
    </form>
  );
}
