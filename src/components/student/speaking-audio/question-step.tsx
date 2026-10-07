"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, PenLine, Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FEEDBACK_LANGUAGES, MAX_PROMPT_CHARS, PART_GUIDE, type FeedbackLanguage, type SpeakingPart } from "@/lib/speaking-audio/constants";
import { parseCuePoints } from "@/lib/speaking-audio/input";
import type { PracticePrompt, StudioTopic } from "@/lib/speaking-audio/studio-types";

/**
 * Phase Q-B, step 1 - what will you answer? A part of the test, then a question from the Speaking Topics the teachers published or one the student types
 * themselves (for Part 2, a cue card: the topic line and the "You should say" points).
 */

const PARTS: SpeakingPart[] = [1, 2, 3];

function randomOf<T>(items: readonly T[]): T | null {
  return items.length === 0 ? null : items[Math.floor(Math.random() * items.length)];
}

export function QuestionStep({ topics, initial, onNext }: { topics: StudioTopic[]; initial: PracticePrompt | null; onNext: (prompt: PracticePrompt) => void }) {
  const [part, setPart] = useState<SpeakingPart>(initial?.part ?? 1);
  const [source, setSource] = useState<"TOPIC" | "OWN">(initial?.source ?? (topics.length > 0 ? "TOPIC" : "OWN"));
  const [language, setLanguage] = useState<FeedbackLanguage>(initial?.feedbackLanguage ?? "en");
  const [topicId, setTopicId] = useState<string | null>(initial?.topicId ?? null);
  const [questionId, setQuestionId] = useState<string | null>(initial?.questionId ?? null);
  const [ownQuestion, setOwnQuestion] = useState(initial?.source === "OWN" ? initial.question : "");
  const [ownPoints, setOwnPoints] = useState(initial?.source === "OWN" ? initial.cueCardPoints.join("\n") : "");

  const forPart = useMemo(() => topics.filter((topic) => topic.part === part), [topics, part]);
  const topic = forPart.find((candidate) => candidate.id === topicId) ?? null;
  const topicsAvailable = forPart.length > 0;
  const effectiveSource = source === "TOPIC" && !topicsAvailable ? "OWN" : source;

  function changePart(next: SpeakingPart) {
    setPart(next);
    setTopicId(null);
    setQuestionId(null);
  }

  function surprise() {
    const picked = randomOf(forPart);
    if (!picked) return;
    setTopicId(picked.id);
    setQuestionId(picked.part === 2 ? null : (randomOf(picked.questions)?.id ?? null));
  }

  const chosenQuestion = topic?.questions.find((question) => question.id === questionId) ?? null;
  const ready = effectiveSource === "OWN" ? ownQuestion.trim().length >= 5 : topic != null && (part === 2 ? topic.cue != null : chosenQuestion != null);

  function next() {
    if (!ready) return;
    if (effectiveSource === "OWN") {
      onNext({ part, source: "OWN", topicId: null, questionId: null, question: ownQuestion.trim().slice(0, MAX_PROMPT_CHARS), cueCardPoints: part === 2 ? parseCuePoints(ownPoints) : [], feedbackLanguage: language });
    } else if (topic) {
      onNext({
        part,
        source: "TOPIC",
        topicId: topic.id,
        questionId: part === 2 ? null : (chosenQuestion?.id ?? null),
        question: part === 2 ? (topic.cue?.description ?? topic.title) : (chosenQuestion?.prompt ?? ""),
        cueCardPoints: part === 2 ? (topic.cue?.points ?? []) : [],
        feedbackLanguage: language,
      });
    }
  }

  return (
    <div className="space-y-6" data-testid="question-step">
      <section className="space-y-3" aria-labelledby="part-heading">
        <h2 id="part-heading" className="font-display text-lg font-medium">
          1. Which part do you want to practise?
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-labelledby="part-heading">
          {PARTS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={part === value}
              data-testid={`part-${value}`}
              onClick={() => changePart(value)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors",
                part === value ? "border-accent bg-accent/10 ring-accent/30 ring-2" : "border-border bg-card hover:bg-secondary/60"
              )}
            >
              <span className="font-display block text-base font-medium">Part {value}</span>
              <span className="text-muted-foreground mt-1 block text-xs">{PART_GUIDE[value].label.replace(/^Part \d - /, "")}</span>
              <span className="text-muted-foreground/80 mt-2 block text-xs">Aim for {PART_GUIDE[value].suggested}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="question-heading">
        <h2 id="question-heading" className="font-display text-lg font-medium">
          2. Which question?
        </h2>
        <div className="bg-secondary inline-flex rounded-full p-1" role="tablist" aria-label="Where the question comes from">
          <button
            type="button"
            role="tab"
            aria-selected={effectiveSource === "TOPIC"}
            disabled={!topicsAvailable}
            data-testid="source-topic"
            onClick={() => setSource("TOPIC")}
            className={cn("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50", effectiveSource === "TOPIC" ? "bg-card shadow-soft" : "text-muted-foreground")}
          >
            <BookOpen className="size-4" /> Speaking Topics
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveSource === "OWN"}
            data-testid="source-own"
            onClick={() => setSource("OWN")}
            className={cn("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors", effectiveSource === "OWN" ? "bg-card shadow-soft" : "text-muted-foreground")}
          >
            <PenLine className="size-4" /> Type my own
          </button>
        </div>
        {!topicsAvailable && <p className="text-muted-foreground text-sm">Your teachers have not published Part {part} topics yet - type your own question below.</p>}

        {effectiveSource === "TOPIC" && topicsAvailable && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">{part === 2 ? "Pick a cue card." : "Pick a topic, then a question."}</p>
              <Button type="button" variant="outline" size="sm" onClick={surprise} data-testid="random-question">
                <Shuffle className="size-4" /> Surprise me
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="topic-list">
              {forPart.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  data-testid={`topic-${candidate.id}`}
                  aria-pressed={topicId === candidate.id}
                  onClick={() => {
                    setTopicId(candidate.id);
                    setQuestionId(null);
                  }}
                  className={cn("rounded-xl border px-4 py-3 text-left text-sm transition-colors", topicId === candidate.id ? "border-accent bg-accent/10" : "border-border bg-card hover:bg-secondary/60")}
                >
                  <span className="block font-medium">{candidate.title}</span>
                  <span className="text-muted-foreground block text-xs">{candidate.part === 2 ? "Cue card" : `${candidate.questions.length} question${candidate.questions.length === 1 ? "" : "s"}`}</span>
                </button>
              ))}
            </div>

            {topic && part !== 2 && (
              <div className="space-y-2" role="radiogroup" aria-label="Question" data-testid="question-list">
                {topic.questions.map((question) => (
                  <button
                    key={question.id}
                    type="button"
                    role="radio"
                    aria-checked={questionId === question.id}
                    data-testid={`question-${question.id}`}
                    onClick={() => setQuestionId(question.id)}
                    className={cn("w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors", questionId === question.id ? "border-accent bg-accent/10" : "border-border bg-card hover:bg-secondary/60")}
                  >
                    {question.prompt}
                  </button>
                ))}
              </div>
            )}
            {topic?.cue && part === 2 && (
              <div className="border-border bg-card space-y-2 rounded-2xl border p-4 text-sm" data-testid="cue-card-preview">
                <p className="font-medium">{topic.cue.description}</p>
                {topic.cue.points.length > 0 && (
                  <ul className="text-muted-foreground list-disc space-y-0.5 pl-5">
                    {topic.cue.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {effectiveSource === "OWN" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="own-question" className="text-sm font-medium">
                {part === 2 ? "Cue card topic" : "Your question"}
              </label>
              <Textarea
                id="own-question"
                data-testid="own-question"
                value={ownQuestion}
                maxLength={MAX_PROMPT_CHARS}
                rows={part === 2 ? 2 : 3}
                placeholder={part === 2 ? "Describe a place you like to visit in your free time." : part === 1 ? "Where do you live and what do you like about it?" : "Why do many young people move to big cities?"}
                onChange={(event) => setOwnQuestion(event.target.value)}
              />
            </div>
            {part === 2 && (
              <div className="space-y-1.5">
                <label htmlFor="own-points" className="text-sm font-medium">
                  You should say (one point per line, optional)
                </label>
                <Textarea id="own-points" data-testid="own-points" value={ownPoints} rows={4} placeholder={"where it is\nhow often you go there\nwhat you do there\nand explain why you like it"} onChange={(event) => setOwnPoints(event.target.value)} />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="language-heading">
        <h2 id="language-heading" className="font-display text-lg font-medium">
          3. Feedback language
        </h2>
        <div className="bg-secondary inline-flex rounded-full p-1" role="radiogroup" aria-labelledby="language-heading">
          {FEEDBACK_LANGUAGES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={language === option.value}
              data-testid={`language-${option.value}`}
              onClick={() => setLanguage(option.value)}
              className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors", language === option.value ? "bg-card shadow-soft" : "text-muted-foreground")}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">The explanations are written in this language. The corrections, better words and the model answer stay in English, because that is what you will say aloud.</p>
      </section>

      <div className="flex justify-end">
        <Button size="lg" disabled={!ready} onClick={next} data-testid="question-next">
          Check my microphone <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
