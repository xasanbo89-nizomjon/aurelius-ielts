import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { dropAbandoned } from "@/lib/speaking-audio/practice";
import { processDue } from "@/lib/speaking-audio/processing";
import { processDue as processDueWriting } from "@/lib/writing-assessment/processing";

/**
 * Phase Q-B - the scheduled job that finishes recorded Speaking practices nobody is waiting for: assessments that were handed over but never started, and ones whose
 * worker died (their lease ran out). Same rules as the Phase K job (see docs/server-expiry.md):
 *
 *   GET /api/cron/speaking-audio      Authorization: Bearer <CRON_SECRET>
 *
 * Without CRON_SECRET the endpoint refuses to run. It is idempotent: a practice is claimed with one conditional update, so two runs (or a run and a student's own page)
 * never assess the same practice twice. A missed run delays nothing that anyone is looking at - the result page and the status route start stuck work themselves.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorised(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set on the server." }, { status: 503 });
  if (!authorised(request, secret)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  try {
    const tally = await processDue({ max: 3, stopAfterMs: 30_000 });
    // Practices started more than a day ago whose recording never arrived are dropped with whatever they left in storage.
    const abandoned = await dropAbandoned(new Date());
    // Phase O - the same job also finishes the AI assessments of Writing sittings that nobody is waiting for (a Full Mock the server handed in by itself, an assessment whose
    // worker died). It starts none after 45 seconds and gives each at most what is left of the function's time, so the job is never cut off half way.
    let writing: { looked: number; done: number; failed: number } | { error: string } = { looked: 0, done: 0, failed: 0 };
    try {
      if (Date.now() - startedAt < 45_000) {
        writing = await processDueWriting({ max: 2, stopAfterMs: 45_000 - (Date.now() - startedAt), deps: { deadline: startedAt + 105_000 } });
      }
    } catch (error) {
      console.error("[cron] writing assessments failed:", error);
      writing = { error: "see the server log" };
    }
    return NextResponse.json({ ok: true, ...tally, abandoned, writing, tookMs: Date.now() - startedAt });
  } catch (error) {
    console.error("[cron] speaking-audio failed:", error);
    return NextResponse.json({ ok: false, error: "The run failed; see the server log." }, { status: 500 });
  }
}
