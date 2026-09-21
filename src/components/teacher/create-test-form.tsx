"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createTestSchema, type CreateTestInput } from "@/lib/validations/test-management";
import { createTestAction } from "@/actions/test-management.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CreateTestForm() {
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
    defaultValues: { type: "READING" },
  });

  const type = watch("type");

  async function onSubmit(values: CreateTestInput) {
    setSubmitting(true);
    const result = await createTestAction(values);
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

      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Create test
      </Button>
    </form>
  );
}
