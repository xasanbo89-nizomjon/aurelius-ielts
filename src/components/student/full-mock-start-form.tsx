"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SoundCheckPanel } from "@/components/exam/official/official-sound-check";
import { usePreloadedTracks } from "@/components/exam/official/use-preloaded-tracks";

import "@/components/exam/official/official-exam.css";

/**
 * Phase 40 — Part 11's instructions acknowledgement, required only on a
 * fresh start (not on resume — a student already mid-attempt has already
 * agreed once). `action` is the real bound startFullMockAttemptAction
 * server action, passed straight through to the form unchanged.
 *
 * Phase I — a fresh sitting begins with the Listening recording, which plays by itself the moment the
 * sitting starts. So before the button: the sound check (put on your headphones, set the volume), and the
 * recordings are loaded in full in the background; "Start Full Mock" waits for both.
 */
export function FullMockStartForm({
  action,
  buttonLabel,
  requireAcknowledgement,
  soundCheck = false,
  audioSources = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  buttonLabel: string;
  requireAcknowledgement: boolean;
  soundCheck?: boolean;
  audioSources?: readonly string[];
}) {
  const [acknowledged, setAcknowledged] = useState(!requireAcknowledgement);
  const withSoundCheck = soundCheck && requireAcknowledgement;
  const [heard, setHeard] = useState(!withSoundCheck);
  const preload = usePreloadedTracks(audioSources, withSoundCheck);
  const audioReady = !withSoundCheck || preload.status === "ready" || preload.status === "idle";

  return (
    <form action={action} className="space-y-4">
      {withSoundCheck && (
        <div className="ex-scope text-left">
          <SoundCheckPanel onHeard={setHeard} />
          {preload.status === "loading" && (
            <p role="status" data-testid="start-audio-loading" className="mt-2 text-sm">
              Loading the Listening recording… {preload.percent > 0 ? `${preload.percent}%` : ""}
            </p>
          )}
          {preload.status === "error" && (
            <p role="alert" data-testid="start-audio-error" className="mt-2 text-sm">
              {preload.error ?? "The recording could not be loaded."}{" "}
              <button type="button" className="underline" onClick={preload.retry}>
                Try again
              </button>
            </p>
          )}
        </div>
      )}
      {requireAcknowledgement && (
        <div className="bg-secondary/50 flex items-start gap-2.5 rounded-xl px-4 py-3.5 text-left text-sm">
          <Checkbox
            id="acknowledge-instructions"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
            className="mt-0.5"
          />
          <label htmlFor="acknowledge-instructions">
            I understand the instructions: once started, sections run in order (Listening → Reading → Writing →
            Speaking), each section is timed, and I cannot go back to a completed section.
            {withSoundCheck && " The Listening recording starts by itself and plays once."}
          </label>
        </div>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={!acknowledged || !heard || !audioReady} data-testid="start-full-mock">
        {buttonLabel}
      </Button>
    </form>
  );
}
