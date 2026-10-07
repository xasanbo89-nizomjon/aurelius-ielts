import { NextResponse } from "next/server";

import { getPractice, nudgeIfStuck } from "@/lib/speaking-audio/practice";
import { processPractice } from "@/lib/speaking-audio/processing";
import { canRetry, failureMessage } from "@/lib/speaking-audio/status";
import { currentViewer } from "@/lib/speaking-audio/viewer";

/**
 * Phase Q-B - how far the assessment of one recorded practice has got, for the page that waits for it (it asks every few seconds; see the result page). A plain GET
 * that answers with a status code, never a redirect: 401 not signed in, 404 not found OR not yours to see (the two look the same), 200 with the status.
 *
 * Asking is also how a practice that nobody is working on gets going again: when its assessment was handed over a while ago and no worker ever started it (or the
 * worker died and its lease ran out), this request starts one in the background. `maxDuration` is the time that background work may take.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(_request: Request, context: { params: Promise<{ practiceId: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to see this practice." }, { status: 401 });

  const { practiceId } = await context.params;
  const practice = await getPractice(viewer, practiceId);
  if (!practice) return NextResponse.json({ error: "This practice was not found." }, { status: 404 });

  nudgeIfStuck(practice, (id) => processPractice(id));

  return NextResponse.json(
    {
      id: practice.id,
      status: practice.status,
      overallBand: practice.overallBand,
      failureCode: practice.failureCode,
      failureMessage: practice.status === "FAILED" ? failureMessage(practice.failureCode, practice.failureMessage) : null,
      canRetry: canRetry(practice.status, practice.failureCode),
      submittedAt: practice.submittedAt?.toISOString() ?? null,
      completedAt: practice.completedAt?.toISOString() ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
