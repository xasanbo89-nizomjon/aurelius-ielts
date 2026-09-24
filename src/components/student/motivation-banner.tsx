"use client";

import { useEffect, useState } from "react";
import { PartyPopper, Sparkles, TrendingDown } from "lucide-react";

import { getMotivationMessageAction, type MotivationResult } from "@/actions/ai-insights.actions";
import { cn } from "@/lib/utils";

const TONE_META = {
  CELEBRATION: { icon: PartyPopper, className: "border-success/30 bg-success/5 text-success" },
  IMPROVEMENT_ALERT: { icon: TrendingDown, className: "border-destructive/30 bg-destructive/5 text-destructive" },
  ENCOURAGEMENT: { icon: Sparkles, className: "border-accent/30 bg-accent/5 text-accent" },
} as const;

/** Phase 25 — AI Motivation Engine. Fetched client-side (not blocking the page's initial render) since it's a nice-to-have, not core content — renders nothing while loading or if there's genuinely not enough data yet. */
export function MotivationBanner() {
  const [result, setResult] = useState<MotivationResult>(null);

  useEffect(() => {
    void getMotivationMessageAction().then(setResult);
  }, []);

  if (!result) return null;

  const meta = TONE_META[result.tone];
  const Icon = meta.icon;

  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border px-5 py-4", meta.className)}>
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <p className="text-sm font-medium">{result.message}</p>
    </div>
  );
}
