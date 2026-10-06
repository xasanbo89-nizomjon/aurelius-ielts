import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { settleExpiredAttempts } from "@/lib/full-mock-attempts";
import { settleExpiredWritingSittings } from "@/lib/writing-sitting";
import { settleExpiredWritingBundleSittings } from "@/lib/writing-bundle-sitting";

/**
 * Phase K - the scheduled job that finalises what has run past its deadline for students nobody is looking at (see docs/server-expiry.md):
 * Reading / Listening attempts, Full Mock sittings (a sitting may pass through several sections in one run) and Writing tasks taken on their own.
 *
 *   GET /api/cron/finalize-expired      Authorization: Bearer <CRON_SECRET>
 *
 * Vercel Cron sends exactly that header when the project has a CRON_SECRET; any other scheduler (an external pinger, GitHub Actions) can send it too.
 * Without CRON_SECRET the endpoint refuses to run. It is idempotent and light (the AI marker is not called), so running it more often only
 * makes expiry sooner. Students and teachers also trigger the same finalisation lazily when they open an attempt, so a missed run delays nothing
 * that anyone is looking at.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const attempts = await settleExpiredAttempts();
    const writingSittings = await settleExpiredWritingSittings();
    // Phase L3 - Writing tests (Task 1 + Task 2 in one 60-minute sitting)
    const writingTestSittings = await settleExpiredWritingBundleSittings();
    return NextResponse.json({ ok: true, ...attempts, writingSittings, writingTestSittings, tookMs: Date.now() - startedAt });
  } catch (error) {
    console.error("[cron] finalize-expired failed:", error);
    return NextResponse.json({ ok: false, error: "The run failed; see the server log." }, { status: 500 });
  }
}
