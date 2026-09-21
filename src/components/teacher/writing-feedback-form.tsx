"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { teacherFeedbackSchema, type TeacherFeedbackInput } from "@/lib/validations/writing";
import { addTeacherFeedbackAction } from "@/actions/writing.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WritingFeedbackForm({
  submissionId,
  initialBandScore,
  initialFeedback,
}: {
  submissionId: string;
  initialBandScore: number | null;
  initialFeedback: string | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TeacherFeedbackInput>({
    resolver: zodResolver(teacherFeedbackSchema),
    defaultValues: { feedback: initialFeedback ?? "", bandScore: initialBandScore ?? undefined },
  });

  async function onSubmit(values: TeacherFeedbackInput) {
    setSubmitting(true);
    const result = await addTeacherFeedbackAction(submissionId, values);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Feedback saved.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your feedback</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="bandScore">Band score (optional)</Label>
            <Input
              id="bandScore"
              type="number"
              min={0}
              max={9}
              step={0.5}
              className="w-28"
              {...register("bandScore", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feedback">Feedback</Label>
            <Textarea id="feedback" rows={6} placeholder="Write your feedback for the student…" {...register("feedback")} />
            {errors.feedback && <p className="text-destructive text-xs">{errors.feedback.message}</p>}
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Save feedback
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
