"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, History, Info, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MicCheck } from "@/components/student/speaking-audio/mic-check";
import { QuestionStep } from "@/components/student/speaking-audio/question-step";
import { RecordStage, type StageRecording } from "@/components/student/speaking-audio/record-stage";
import { SendStage } from "@/components/student/speaking-audio/send-stage";
import { cn } from "@/lib/utils";
import { AI_ESTIMATE_LABEL } from "@/lib/speaking-audio/constants";
import { dailyLimitMessage } from "@/lib/speaking-audio/limits";
import { agoText, clock, snippet } from "@/lib/speaking-audio/format";
import { clearUnsent, loadUnsent, saveUnsent, type UnsentRecording } from "@/lib/speaking-audio/unsent-store";
import type { AllowanceInfo, PracticePrompt, StudioTopic } from "@/lib/speaking-audio/studio-types";

/**
 * Phase Q-B - the recording screen of the Speaking practice: question -> microphone check -> record -> send. It keeps the question and the finished recording in the
 * page, so going back never loses them - and in the browser's own storage, so a closed tab or a phone that discarded the page does not either: the next visit offers to
 * send it. Once the recording has been sent it hands over to the result page.
 */

type Step = "question" | "mic" | "record" | "send";

const STEPS: { id: Step; label: string }[] = [
  { id: "question", label: "Question" },
  { id: "mic", label: "Microphone" },
  { id: "record", label: "Record" },
  { id: "send", label: "Send" },
];

export function SpeakingStudio({ userKey, topics, initialPrompt, allowance }: { userKey: string; topics: StudioTopic[]; initialPrompt: PracticePrompt | null; allowance: AllowanceInfo }) {
  const [step, setStep] = useState<Step>("question");
  const [prompt, setPrompt] = useState<PracticePrompt | null>(initialPrompt);
  const [recorded, setRecorded] = useState<StageRecording | null>(null);
  const [unsent, setUnsent] = useState<UnsentRecording | null>(null);

  // A recording that never reached the server (the tab was closed, the connection died) is still in this browser: offer it.
  useEffect(() => {
    let alive = true;
    void loadUnsent(userKey).then((entry) => {
      if (alive) setUnsent(entry);
    });
    return () => {
      alive = false;
    };
  }, [userKey]);

  const handleRecorded = useCallback(
    (state: StageRecording | null) => {
      setRecorded(state);
      if (state && prompt) {
        void saveUnsent({ userKey, prompt, notes: state.notes, blob: state.recording.blob, seconds: state.recording.seconds, bytes: state.recording.bytes, peak: state.recording.peak });
      } else {
        void clearUnsent(userKey);
      }
      setUnsent(null);
    },
    [prompt, userKey]
  );

  const handleSent = useCallback(() => {
    void clearUnsent(userKey);
  }, [userKey]);

  function resumeUnsent(entry: UnsentRecording) {
    setPrompt(entry.prompt);
    setRecorded({ recording: { blob: entry.blob, bytes: entry.bytes, seconds: entry.seconds, peak: entry.peak }, notes: entry.notes });
    setUnsent(null);
    setStep("record");
  }

  function discardUnsent() {
    void clearUnsent(userKey);
    setUnsent(null);
  }

  if (!allowance.allowed) {
    return (
      <div className="border-border bg-card space-y-3 rounded-2xl border p-6" data-testid="limit-reached">
        <p className="font-display text-lg font-medium">{dailyLimitMessage(allowance.limit)}</p>
        <p className="text-muted-foreground text-sm">Your practices come back {allowance.resetsInText}.</p>
        <Button asChild variant="outline">
          <Link href="/student/speaking-practice/recordings">
            <History className="size-4" /> My recordings and feedback
          </Link>
        </Button>
      </div>
    );
  }

  const index = STEPS.findIndex((candidate) => candidate.id === step);

  return (
    <div className="space-y-6" data-testid="speaking-studio" data-step={step}>
      <nav aria-label="Progress" className="flex w-full items-center gap-2 overflow-x-auto pb-1">
        {STEPS.map((candidate, position) => (
          <div key={candidate.id} className="flex shrink-0 items-center gap-2" data-testid={`step-${candidate.id}`} data-state={position < index ? "done" : position === index ? "current" : "todo"}>
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-medium",
                position < index ? "bg-success text-white" : position === index ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
              )}
              aria-current={position === index ? "step" : undefined}
            >
              {position < index ? <Check className="size-3.5" /> : position + 1}
            </span>
            {/* On a phone only the current step keeps its name (the four of them side by side are wider than the screen). */}
            <span className={cn("text-sm", position === index ? "font-medium" : "text-muted-foreground hidden sm:inline")}>{candidate.label}</span>
            {position < STEPS.length - 1 && <span className="bg-border h-px w-3 sm:w-6" aria-hidden="true" />}
          </div>
        ))}
      </nav>

      <p className="text-muted-foreground flex items-start gap-2 text-xs" data-testid="allowance">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {allowance.remaining} of {allowance.limit} recorded practices left today. Practice only: the result is an {AI_ESTIMATE_LABEL.replace("AI estimate - ", "AI estimate, ")}.
        </span>
      </p>

      {unsent && step === "question" && (
        <div className="border-accent/40 bg-accent/5 space-y-3 rounded-2xl border p-4 text-sm" data-testid="unsent-banner">
          <p className="font-medium">You have a recording that was never sent</p>
          <p className="text-muted-foreground">
            Part {unsent.prompt.part} - &ldquo;{snippet(unsent.prompt.question, 80)}&rdquo; - {clock(unsent.seconds)} long, recorded {agoText(unsent.savedAt)}. It is still on this device.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => resumeUnsent(unsent)} data-testid="unsent-resume">
              <Send className="size-4" /> Listen to it and send it
            </Button>
            <Button size="sm" variant="outline" onClick={discardUnsent} data-testid="unsent-discard">
              <Trash2 className="size-4" /> Throw it away
            </Button>
          </div>
        </div>
      )}

      {step === "question" && (
        <QuestionStep
          topics={topics}
          initial={prompt}
          onNext={(next) => {
            // A kept recording is only replaced by a NEW recording or thrown away on purpose - choosing another question does not delete it.
            setPrompt(next);
            setRecorded(null);
            setStep("mic");
          }}
        />
      )}
      {step === "mic" && <MicCheck onDone={() => setStep("record")} onBack={() => setStep("question")} />}
      {step === "record" && prompt && (
        <RecordStage
          prompt={prompt}
          initial={recorded}
          onRecorded={handleRecorded}
          onSend={(state) => {
            setRecorded(state);
            setStep("send");
          }}
          onBack={() => setStep("mic")}
        />
      )}
      {step === "send" && prompt && recorded && <SendStage prompt={prompt} state={recorded} onBack={() => setStep("record")} onSent={handleSent} />}
    </div>
  );
}
