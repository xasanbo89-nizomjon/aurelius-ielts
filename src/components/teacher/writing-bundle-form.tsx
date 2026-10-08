"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createWritingBundleAction } from "@/actions/writing-bundle.actions";
import { TASK_1_CATEGORIES, TASK_2_CATEGORIES, type WritingTaskCategoryValue, type WritingTrainingTypeValue } from "@/lib/validations/writing";
import { WRITING_TASK_CATEGORY_LABELS } from "@/lib/labels";
import type { WritingTaskImage } from "@/lib/writing-task-image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FIELD, NativeSelect } from "@/components/teacher/test-builder/controls";
import { WritingTaskImageField } from "@/components/teacher/writing-task-image-field";
import { WritingPdfVisualField, type PdfVisualChoice } from "@/components/teacher/writing-pdf-visual-field";
import { ShowResultsField } from "@/components/teacher/show-results-field";
import { SHOW_RESULTS_REQUIRED_MESSAGE } from "@/lib/exam/result-visibility-rules";

type VisualMode = "none" | "image" | "pdf";

const TASK_1_PLACEHOLDER = "The chart below shows … Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.";
const TASK_2_PLACEHOLDER = "Some people think … To what extent do you agree or disagree? Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.";

/**
 * The wizard's "Writing test": Task 1 and Task 2 made together (they share one bundle id and are ordinary tasks of the Writing task bank). Task 1's
 * picture is an uploaded picture, or one page of a PDF turned into a PNG - previewed here before anything is saved.
 */
export function WritingBundleForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [trainingType, setTrainingType] = useState<WritingTrainingTypeValue>("ACADEMIC");
  const [category1, setCategory1] = useState<WritingTaskCategoryValue>("GRAPH");
  const [prompt1, setPrompt1] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<VisualMode>("image");
  const [image, setImage] = useState<WritingTaskImage | null>(null);
  const [pdf, setPdf] = useState<PdfVisualChoice | null>(null);
  const [category2, setCategory2] = useState<WritingTaskCategoryValue>("OPINION");
  const [prompt2, setPrompt2] = useState("");
  // Phase O - "Show results to students?": not chosen until the teacher picks Yes or No.
  const [showResults, setShowResults] = useState<boolean | null>(null);
  const [showResultsError, setShowResultsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (showResults === null) {
      setShowResultsError(SHOW_RESULTS_REQUIRED_MESSAGE);
      toast.error(SHOW_RESULTS_REQUIRED_MESSAGE);
      return;
    }
    setSubmitting(true);
    const visual = mode === "image" && image ? ({ kind: "image", mediaFileId: image.mediaFileId } as const) : mode === "pdf" && pdf ? ({ kind: "pdf", pdfUrl: pdf.pdfUrl, page: pdf.page } as const) : null;
    const result = await createWritingBundleAction({
      name,
      trainingType,
      showResultsToStudent: showResults,
      task1: { category: category1, prompt: prompt1, visualDescription: description || undefined, visual },
      task2: { category: category2, prompt: prompt2 },
    });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Writing test created: Task 1 and Task 2 are in your task bank as drafts.");
    router.push("/teacher/writing");
  }

  return (
    <div className="max-w-3xl space-y-6" data-testid="writing-bundle-form">
      <section className="border-border/70 bg-card grid grid-cols-1 gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="bundle-name">
            Name of the Writing test
          </label>
          <input id="bundle-name" className={FIELD} value={name} onChange={(event) => setName(event.target.value)} placeholder="Academic Writing - Practice 1" data-testid="bundle-name" />
          <p className="text-muted-foreground text-xs">The two tasks are called &quot;… - Task 1&quot; and &quot;… - Task 2&quot;.</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="bundle-training">
            Training type
          </label>
          <NativeSelect id="bundle-training" value={trainingType} onChange={(event) => setTrainingType(event.target.value as WritingTrainingTypeValue)}>
            <option value="ACADEMIC">Academic</option>
            <option value="GENERAL">General Training</option>
          </NativeSelect>
        </div>
      </section>

      <section className="border-border/70 bg-card space-y-3 rounded-2xl border p-4" data-testid="bundle-task-1">
        <h2 className="font-display text-lg font-medium">Task 1</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="bundle-cat-1">
              Kind of visual
            </label>
            <NativeSelect id="bundle-cat-1" value={category1} onChange={(event) => setCategory1(event.target.value as WritingTaskCategoryValue)}>
              {TASK_1_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {WRITING_TASK_CATEGORY_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="bundle-prompt-1">
              Task 1 prompt
            </label>
            <Textarea id="bundle-prompt-1" rows={4} value={prompt1} onChange={(event) => setPrompt1(event.target.value)} placeholder={TASK_1_PLACEHOLDER} data-testid="bundle-prompt-1" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Task 1 picture</p>
          <div className="flex gap-1" role="tablist" aria-label="Where the picture comes from">
            {(
              [
                ["image", "A picture (JPG, PNG, WEBP)"],
                ["pdf", "A page of a PDF"],
                ["none", "No picture"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn("rounded-lg border px-3 py-1.5 text-sm", mode === value ? "bg-secondary border-border font-medium" : "border-transparent hover:bg-secondary/50")}
                data-testid={`visual-mode-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "image" && <WritingTaskImageField value={image} onChange={setImage} />}
          {mode === "pdf" && <WritingPdfVisualField value={pdf} onChange={setPdf} />}
          {mode === "none" && <p className="text-muted-foreground text-xs">Describe the visual in words below, or leave Task 1 without one.</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="bundle-desc">
            Description of the visual (optional - read out for accessibility)
          </label>
          <Textarea id="bundle-desc" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
      </section>

      <section className="border-border/70 bg-card space-y-3 rounded-2xl border p-4" data-testid="bundle-task-2">
        <h2 className="font-display text-lg font-medium">Task 2</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="bundle-cat-2">
              Essay type
            </label>
            <NativeSelect id="bundle-cat-2" value={category2} onChange={(event) => setCategory2(event.target.value as WritingTaskCategoryValue)}>
              {TASK_2_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {WRITING_TASK_CATEGORY_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="bundle-prompt-2">
              Task 2 prompt
            </label>
            <Textarea id="bundle-prompt-2" rows={4} value={prompt2} onChange={(event) => setPrompt2(event.target.value)} placeholder={TASK_2_PLACEHOLDER} data-testid="bundle-prompt-2" />
          </div>
        </div>
      </section>

      <ShowResultsField
        value={showResults}
        onChange={(next) => {
          setShowResults(next);
          setShowResultsError(null);
        }}
        error={showResultsError ?? undefined}
      />

      <Button type="button" onClick={() => void submit()} disabled={submitting} data-testid="create-bundle">
        {submitting && <Loader2 className="size-4 animate-spin" />} Create the Writing test
      </Button>
    </div>
  );
}
