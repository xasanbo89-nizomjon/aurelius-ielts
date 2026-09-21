"use client";

import { useEffect, useState } from "react";
import type { QuestionType } from "@prisma/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER, defaultPayloadFor } from "@/lib/exam/question-types";
import { addQuestionAction, updateQuestionAction } from "@/actions/test-management.actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultipleChoiceEditor } from "@/components/teacher/question-editors/multiple-choice-editor";
import { TrueFalseEditor } from "@/components/teacher/question-editors/true-false-editor";
import { MatchingEditor } from "@/components/teacher/question-editors/matching-editor";
import { TextAnswerEditor } from "@/components/teacher/question-editors/text-answer-editor";
import { SummaryCompletionEditor } from "@/components/teacher/question-editors/summary-completion-editor";

export type ExistingQuestion = {
  id: string;
  passageId: string | null;
  type: QuestionType;
  prompt: string;
  points: number;
  options: unknown;
  correctAnswer: unknown;
};

export function QuestionEditorDialog({
  open,
  onOpenChange,
  testId,
  passages,
  existingQuestion,
  defaultPassageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: string;
  passages: { id: string; title: string }[];
  existingQuestion?: ExistingQuestion;
  defaultPassageId?: string;
}) {
  const [type, setType] = useState<QuestionType>("MULTIPLE_CHOICE");
  const [passageId, setPassageId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [points, setPoints] = useState(1);
  const [options, setOptions] = useState<unknown>({});
  const [correctAnswer, setCorrectAnswer] = useState<unknown>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (existingQuestion) {
      setType(existingQuestion.type);
      setPassageId(existingQuestion.passageId ?? "");
      setPrompt(existingQuestion.prompt);
      setPoints(existingQuestion.points);
      setOptions(existingQuestion.options ?? {});
      setCorrectAnswer(existingQuestion.correctAnswer ?? "");
    } else {
      const defaults = defaultPayloadFor("MULTIPLE_CHOICE");
      setType("MULTIPLE_CHOICE");
      setPassageId(defaultPassageId ?? passages[0]?.id ?? "");
      setPrompt("");
      setPoints(1);
      setOptions(defaults.options);
      setCorrectAnswer(defaults.correctAnswer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingQuestion]);

  function handleTypeChange(nextType: QuestionType) {
    setType(nextType);
    const defaults = defaultPayloadFor(nextType);
    setOptions(defaults.options);
    setCorrectAnswer(defaults.correctAnswer);
  }

  function updatePayload(nextOptions: unknown, nextCorrectAnswer: unknown) {
    setOptions(nextOptions);
    setCorrectAnswer(nextCorrectAnswer);
  }

  async function handleSubmit() {
    if (!prompt.trim()) {
      toast.error("Add a prompt for this question.");
      return;
    }

    setSubmitting(true);
    const base = { passageId: passageId || undefined, type, prompt, points };
    const result = existingQuestion
      ? await updateQuestionAction(existingQuestion.id, testId, base, options as never, correctAnswer as never)
      : await addQuestionAction(testId, base, options as never, correctAnswer as never);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success(existingQuestion ? "Question updated." : "Question added.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existingQuestion ? "Edit question" : "Add question"}</DialogTitle>
          <DialogDescription>Choose a question type, then fill in its answer key.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Question type</Label>
              <Select value={type} onValueChange={(value) => handleTypeChange(value as QuestionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {QUESTION_TYPE_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Passage / section</Label>
              <Select value={passageId} onValueChange={setPassageId}>
                <SelectTrigger>
                  <SelectValue placeholder={passages.length === 0 ? "No passages yet" : "No passage"} />
                </SelectTrigger>
                <SelectContent>
                  {passages.map((passage) => (
                    <SelectItem key={passage.id} value={passage.id}>
                      {passage.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              rows={2}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="What does the writer suggest about…"
            />
          </div>

          <div className="max-w-28 space-y-1.5">
            <Label htmlFor="points">Points</Label>
            <Input
              id="points"
              type="number"
              min={1}
              value={points}
              onChange={(event) => setPoints(Number(event.target.value) || 1)}
            />
          </div>

          <div className="border-border/70 rounded-xl border p-4">
            {type === "MULTIPLE_CHOICE" && (
              <MultipleChoiceEditor
                options={options as never}
                correctAnswer={correctAnswer as never}
                onChange={updatePayload}
              />
            )}
            {type === "TRUE_FALSE_NOT_GIVEN" && (
              <TrueFalseEditor
                options={options as never}
                correctAnswer={correctAnswer as never}
                onChange={updatePayload}
              />
            )}
            {type === "MATCHING" && (
              <MatchingEditor
                options={options as never}
                correctAnswer={correctAnswer as never}
                onChange={updatePayload}
              />
            )}
            {type === "SUMMARY_COMPLETION" && (
              <SummaryCompletionEditor
                options={options as never}
                correctAnswer={correctAnswer as never}
                onChange={updatePayload}
              />
            )}
            {(type === "SENTENCE_COMPLETION" || type === "FILL_IN_BLANK" || type === "SHORT_ANSWER") && (
              <TextAnswerEditor
                options={options as never}
                correctAnswer={correctAnswer as never}
                onChange={updatePayload}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {existingQuestion ? "Save changes" : "Add question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
