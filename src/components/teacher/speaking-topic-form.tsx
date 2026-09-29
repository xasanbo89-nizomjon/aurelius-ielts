"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { createSpeakingTopicAction, updateSpeakingTopicAction } from "@/actions/speaking-practice.actions";
import type { SpeakingPracticePartValue } from "@/lib/validations/speaking-practice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ExistingSpeakingTopic = {
  id: string;
  title: string;
  part: SpeakingPracticePartValue;
  cueCardDescription: string | null;
  cueCardBulletPoints: string[];
  cueCardFollowUp: string | null;
};

const PART_OPTIONS: { value: SpeakingPracticePartValue; label: string }[] = [
  { value: "PART_1", label: "Part 1 — Introduction (short questions)" },
  { value: "PART_2", label: "Part 2 — Cue Card" },
  { value: "PART_3", label: "Part 3 — Discussion (questions)" },
];

export function SpeakingTopicForm({ existingTopic }: { existingTopic?: ExistingSpeakingTopic }) {
  const router = useRouter();
  const [title, setTitle] = useState(existingTopic?.title ?? "");
  const [part, setPart] = useState<SpeakingPracticePartValue>(existingTopic?.part ?? "PART_1");
  const [cueCardDescription, setCueCardDescription] = useState(existingTopic?.cueCardDescription ?? "");
  const [bulletPoints, setBulletPoints] = useState<string[]>(existingTopic?.cueCardBulletPoints.length ? existingTopic.cueCardBulletPoints : [""]);
  const [cueCardFollowUp, setCueCardFollowUp] = useState(existingTopic?.cueCardFollowUp ?? "");
  const [submitting, setSubmitting] = useState(false);

  function updateBullet(index: number, value: string) {
    setBulletPoints((prev) => prev.map((b, i) => (i === index ? value : b)));
  }
  function addBullet() {
    setBulletPoints((prev) => [...prev, ""]);
  }
  function removeBullet(index: number) {
    setBulletPoints((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!title.trim()) return toast.error("Give the topic a title.");
    if (part === "PART_2" && !cueCardDescription.trim()) return toast.error("Add the cue card description.");

    setSubmitting(true);
    const input = {
      title,
      part,
      ...(part === "PART_2" && {
        cueCardDescription,
        cueCardBulletPoints: bulletPoints.map((b) => b.trim()).filter(Boolean),
        cueCardFollowUp: cueCardFollowUp.trim() || undefined,
      }),
    };
    const result = existingTopic ? await updateSpeakingTopicAction(existingTopic.id, input) : await createSpeakingTopicAction(input);
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(existingTopic ? "Topic updated." : "Topic created.");
    if (!existingTopic && "topicId" in result && result.topicId) {
      router.push(`/teacher/speaking-topics/${result.topicId}`);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="topic-title">Title</Label>
        <Input id="topic-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Hometown" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="topic-part">Part</Label>
        <Select value={part} onValueChange={(value) => setPart(value as SpeakingPracticePartValue)}>
          <SelectTrigger id="topic-part">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PART_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {part === "PART_2" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="cue-description">Cue card description</Label>
            <Textarea
              id="cue-description"
              rows={2}
              value={cueCardDescription}
              onChange={(event) => setCueCardDescription(event.target.value)}
              placeholder="Describe a person you admire."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Bullet points (&quot;You should say:&quot;)</Label>
            <div className="space-y-2">
              {bulletPoints.map((bullet, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input value={bullet} onChange={(event) => updateBullet(index, event.target.value)} placeholder="who the person is" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeBullet(index)} disabled={bulletPoints.length <= 1}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addBullet}>
              <Plus className="size-3.5" /> Add bullet point
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cue-followup">Follow-up instruction (optional)</Label>
            <Textarea
              id="cue-followup"
              rows={2}
              value={cueCardFollowUp}
              onChange={(event) => setCueCardFollowUp(event.target.value)}
              placeholder="and explain how they influenced you."
            />
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Save the topic, then add {part === "PART_1" ? "short personal questions" : "discussion questions"} below.
        </p>
      )}

      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {existingTopic ? "Save changes" : "Create topic"}
      </Button>
    </div>
  );
}
