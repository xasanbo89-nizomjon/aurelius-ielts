"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Phase 40 — Part 11's instructions acknowledgement, required only on a
 * fresh start (not on resume — a student already mid-attempt has already
 * agreed once). `action` is the real bound startFullMockAttemptAction
 * server action, passed straight through to the form unchanged.
 */
export function FullMockStartForm({
  action,
  buttonLabel,
  requireAcknowledgement,
}: {
  action: (formData: FormData) => void | Promise<void>;
  buttonLabel: string;
  requireAcknowledgement: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState(!requireAcknowledgement);

  return (
    <form action={action} className="space-y-4">
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
          </label>
        </div>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={!acknowledged}>
        {buttonLabel}
      </Button>
    </form>
  );
}
