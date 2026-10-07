"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { setSpeakingDailyLimitAction } from "@/actions/speaking-audio.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Phase Q-B - the Root Teacher's one number: how many recorded Speaking practices each student may make a day (the server checks that it is the Root Teacher asking). */
export function DailyLimitForm({ current }: { current: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 100;

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setSpeakingDailyLimitAction(parsed);
        if (!result.success) {
          setMessage({ ok: false, text: result.error });
          return;
        }
        setValue(String(result.limit));
        setMessage({ ok: true, text: `Saved: each student can record ${result.limit} practice${result.limit === 1 ? "" : "s"} a day.` });
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "Could not reach the server. Try again." });
      }
    });
  }

  return (
    <div className="space-y-2" data-testid="daily-limit-form">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block text-xs">Practices per student per day (1-100)</span>
          <Input type="number" min={1} max={100} step={1} value={value} onChange={(event) => setValue(event.target.value)} className="w-32" data-testid="daily-limit-input" />
        </label>
        <Button onClick={save} disabled={pending || !valid || parsed === current} data-testid="daily-limit-save">
          <Check className="size-4" /> Save
        </Button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-success text-xs" : "text-destructive text-xs"} data-testid="daily-limit-message">
          {message.text}
        </p>
      )}
    </div>
  );
}
