"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { setWritingDailyLimitAction } from "@/actions/writing-assessment.actions";
import { MAX_WRITING_DAILY_LIMIT } from "@/lib/writing-assessment/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Phase O - the Root Teacher's one number for Writing: how many Writing sittings each student may have assessed by the AI a day (the server checks that it is the Root Teacher asking). */
export function WritingDailyLimitForm({ current }: { current: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_WRITING_DAILY_LIMIT;

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setWritingDailyLimitAction(parsed);
        if (!result.success) {
          setMessage({ ok: false, text: result.error });
          return;
        }
        setValue(String(result.limit));
        setMessage({ ok: true, text: `Saved: each student can have ${result.limit} Writing sitting${result.limit === 1 ? "" : "s"} assessed a day.` });
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "Could not reach the server. Try again." });
      }
    });
  }

  return (
    <div className="space-y-2" data-testid="writing-limit-form">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block text-xs">Assessed Writing sittings per student per day (1-{MAX_WRITING_DAILY_LIMIT})</span>
          <Input type="number" min={1} max={MAX_WRITING_DAILY_LIMIT} step={1} value={value} onChange={(event) => setValue(event.target.value)} className="w-32" data-testid="writing-limit-input" />
        </label>
        <Button onClick={save} disabled={pending || !valid || parsed === current} data-testid="writing-limit-save">
          <Check className="size-4" /> Save
        </Button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-success text-xs" : "text-destructive text-xs"} data-testid="writing-limit-message">
          {message.text}
        </p>
      )}
    </div>
  );
}
