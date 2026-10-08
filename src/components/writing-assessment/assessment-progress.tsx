"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pollDelayMs, waitText, type AssessmentStatus } from "@/lib/writing-assessment/status";

/**
 * Phase O - what is shown while the AI assessment of a Writing sitting is being made. It asks the server how far it has got every few seconds (quick at first, slower
 * later) and reloads the page the moment the assessment is finished or has failed. Nothing here is needed for the assessment to happen: it runs on the server whether this
 * page is open or not.
 */
export function WritingAssessmentProgress({ assessmentId, initialStatus, sinceIso, leaveHref, leaveLabel }: { assessmentId: string; initialStatus: AssessmentStatus; sinceIso: string | null; leaveHref: string; leaveLabel: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<AssessmentStatus>(initialStatus);
  const [offline, setOffline] = useState(false);
  // The waiting time is only known in the browser: it is 0 in the first render (the server's and the browser's first render must read the same) and counted from then on.
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = sinceIso ? new Date(sinceIso).getTime() : Date.now();
    setElapsed(Math.max(0, Date.now() - startedAt));
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    const look = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`/api/writing-assessment/${assessmentId}/status`, { cache: "no-store" });
        if (response.ok) {
          const body = (await response.json()) as { status: AssessmentStatus };
          failures = 0;
          setOffline(false);
          if (stopped) return;
          setStatus(body.status);
          if (body.status === "DONE" || body.status === "FAILED") {
            // The page is reloaded to show the report. If this screen is still here in 3 seconds the reload did not take: look again and reload again.
            router.refresh();
            timer = setTimeout(look, 3000);
            return;
          }
        } else if (response.status === 404 || response.status === 401) {
          // Not signed in any more / not found: the page decides what to show. A 401 can also be a passing failure of the sign-in check on the server, so the looking
          // goes on - a screen that stops asking would stay on "being assessed" for ever.
          router.refresh();
          failures++;
        } else {
          failures++;
        }
      } catch {
        failures++;
      }
      if (failures >= 3) setOffline(true);
      const waited = Date.now() - startedAt;
      setElapsed(waited);
      timer = setTimeout(look, pollDelayMs(waited));
    };
    timer = setTimeout(look, 1500);
    const clock = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(clock);
    };
  }, [assessmentId, router, sinceIso]);

  const long = elapsed > 3 * 60_000;

  return (
    <div className="border-border bg-card space-y-4 rounded-2xl border p-6 text-center" data-testid="writing-assessment-progress" data-status={status}>
      <Loader2 className="text-accent mx-auto size-8 animate-spin" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-display text-lg font-medium" role="status" aria-live="polite">
          {status === "PROCESSING" ? "The AI is reading your writing and preparing the assessment" : "Your writing has been handed in - the assessment is about to start"}
        </p>
        <p className="text-muted-foreground text-sm">
          This usually takes about a minute ({waitText(elapsed)} so far).{long ? " It is taking longer than usual, but it is still running in the background." : ""}
        </p>
      </div>
      {offline && (
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs" data-testid="progress-offline">
          <Wifi className="size-3.5" /> Cannot reach the server right now - still trying. The assessment itself is not affected.
        </p>
      )}
      <p className="text-muted-foreground text-xs">You do not have to wait here: you can leave this page and come back later - the report will be saved.</p>
      <Button asChild variant="outline" size="sm">
        <Link href={leaveHref}>{leaveLabel}</Link>
      </Button>
    </div>
  );
}
