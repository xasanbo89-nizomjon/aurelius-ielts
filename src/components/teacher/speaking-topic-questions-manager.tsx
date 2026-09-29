"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  addSpeakingQuestionAction,
  deleteSpeakingQuestionAction,
  updateSpeakingQuestionAction,
} from "@/actions/speaking-practice.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";

export type ExistingSpeakingQuestion = { id: string; prompt: string };

export function SpeakingTopicQuestionsManager({ topicId, questions }: { topicId: string; questions: ExistingSpeakingQuestion[] }) {
  const [newPrompt, setNewPrompt] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAdd() {
    if (!newPrompt.trim()) return;
    setAdding(true);
    const result = await addSpeakingQuestionAction(topicId, { prompt: newPrompt });
    setAdding(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setNewPrompt("");
    toast.success("Question added.");
  }

  function startEdit(question: ExistingSpeakingQuestion) {
    setEditingId(question.id);
    setEditValue(question.prompt);
  }

  async function handleSaveEdit(questionId: string) {
    if (!editValue.trim()) return;
    setBusyId(questionId);
    const result = await updateSpeakingQuestionAction(questionId, topicId, { prompt: editValue });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setEditingId(null);
    toast.success("Question updated.");
  }

  async function handleDelete(questionId: string) {
    setBusyId(questionId);
    const result = await deleteSpeakingQuestionAction(questionId, topicId);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Question removed.");
  }

  return (
    <div className="max-w-xl space-y-4">
      <h2 className="font-display text-lg font-medium">Questions</h2>

      {questions.length === 0 ? (
        <EmptyState icon={MessageCircle} title="No questions yet" description="Add at least one question before publishing this topic." />
      ) : (
        <div className="space-y-2">
          {questions.map((question, index) => (
            <Card key={question.id} className="py-3">
              <CardContent className="flex items-center gap-2">
                <span className="text-muted-foreground w-5 shrink-0 text-sm">{index + 1}.</span>
                {editingId === question.id ? (
                  <>
                    <Input value={editValue} onChange={(event) => setEditValue(event.target.value)} className="flex-1" autoFocus />
                    <Button size="icon" variant="ghost" onClick={() => handleSaveEdit(question.id)} disabled={busyId === question.id}>
                      {busyId === question.id ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="flex-1 text-sm">{question.prompt}</p>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(question)} aria-label="Edit question">
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(question.id)}
                      disabled={busyId === question.id}
                      aria-label="Delete question"
                    >
                      {busyId === question.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={newPrompt}
          onChange={(event) => setNewPrompt(event.target.value)}
          placeholder="Where do you live?"
          onKeyDown={(event) => {
            if (event.key === "Enter") handleAdd();
          }}
        />
        <Button onClick={handleAdd} disabled={adding || !newPrompt.trim()}>
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}
