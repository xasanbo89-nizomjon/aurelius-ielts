import { NextResponse } from "next/server";

import { getAssessment, nudgeIfStuck } from "@/lib/writing-assessment/assessment";
import { failureMessage } from "@/lib/writing-assessment/status";
import { currentViewer } from "@/lib/speaking-audio/viewer";

/**
 * Phase O - how far the AI assessment of one Writing sitting has got, for the page that waits for it (it asks every few seconds). A plain GET that answers with a status
 * code, never a redirect: 401 not signed in, 404 not found OR not yours to see OR hidden from you (they look the same), 200 with the status. It never carries a band: the
 * page reads the report itself, where the visibility rules are applied.
 *
 * Asking is also how an assessment that nobody is working on gets going again: when it was queued a while ago and no worker ever started it (or the worker died and its
 * lease ran out), this request starts one in the background. `maxDuration` is the time that background work may take.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(_request: Request, context: { params: Promise<{ assessmentId: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in to see this assessment." }, { status: 401 });

  const { assessmentId } = await context.params;
  const found = await getAssessment(viewer, assessmentId);
  if (!found || found.kind === "hidden") return NextResponse.json({ error: "This assessment was not found." }, { status: 404 });

  const { record, status, canRetry } = found.view;
  nudgeIfStuck(record);

  return NextResponse.json(
    {
      id: record.id,
      status,
      failureCode: record.failureCode,
      failureMessage: status === "FAILED" ? failureMessage(record.failureCode, record.failureMessage) : null,
      canRetry,
      completedAt: record.completedAt?.toISOString() ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
