import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseBuffer } from "music-metadata";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { resolvePassageAudioSrc } from "@/lib/uploads/audio-constraints";

/**
 * Phase K - the length of a Listening recording, measured ON THE SERVER from the file itself (never taken from the browser), and kept on
 * the passage (`Passage.audioDurationSeconds`). The Listening deadline of a sitting is built from it (see lib/exam/section-deadline).
 */

const MIME_BY_EXTENSION: Record<string, string> = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4" };

/** Whole seconds (rounded up) of an audio file's bytes, or null when the file cannot be read as audio. */
export async function measureAudioDurationSeconds(bytes: Uint8Array, hint?: { mimeType?: string | null; fileName?: string | null }): Promise<number | null> {
  try {
    const extension = hint?.fileName ? path.extname(hint.fileName).toLowerCase() : "";
    const mimeType = hint?.mimeType || MIME_BY_EXTENSION[extension];
    const meta = await parseBuffer(bytes, mimeType ? { mimeType } : undefined, { duration: true });
    const seconds = meta.format.duration;
    return seconds != null && Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
  } catch {
    return null;
  }
}

/** The bytes behind a stored recording reference: a public storage URL, or (a local development upload) a path under /public. */
async function readRecording(src: string): Promise<Uint8Array | null> {
  try {
    if (/^https?:\/\//i.test(src)) {
      const response = await fetch(src, { cache: "no-store" });
      if (!response.ok) return null;
      return new Uint8Array(await response.arrayBuffer());
    }
    if (src.startsWith("/")) return new Uint8Array(await readFile(path.join(process.cwd(), "public", src.replace(/^\/+/, ""))));
  } catch {
    return null;
  }
  return null;
}

/**
 * Measures a test's recordings once the response has gone out (a 40 MB recording is read and parsed here, which must not hold up the save).
 * Best effort: if it fails or never runs, the length is measured when the first Listening sitting of the test starts, or by `npm run audio:measure`.
 */
export function scheduleRecordingMeasure(mockTestId: string): void {
  const run = async () => {
    try {
      await ensureRecordingLengths(mockTestId);
    } catch (error) {
      console.error("[recording-length] could not measure the recording of", mockTestId, error);
    }
  };
  try {
    after(run);
  } catch {
    void run(); // not inside a request (a script)
  }
}

type PassageAudio = { id: string; audioPath: string | null; audioUrl: string | null; audioFileName: string | null; audioMimeType: string | null; audioDurationSeconds: number | null };

export type RecordingReport = {
  /** The stored reference (public URL or /public path) of one distinct recording. */
  src: string;
  passageIds: string[];
  /** The length already stored on the passages (null = not measured yet). */
  storedSeconds: number | null;
  /** The length measured just now (only when nothing was stored and measuring was allowed). */
  measuredSeconds: number | null;
  /** "stored" | "measured" | "unreadable" (the file could not be fetched or is not audio) | "skipped" (not measured: measure is off). */
  status: "stored" | "measured" | "unreadable" | "skipped";
};

/**
 * The recordings of one Listening test and their lengths. One entry per DISTINCT file (a recording shared by the four parts is read once).
 * `persist: false` measures without writing anything - what the dry run of `npm run audio:measure` uses.
 */
export async function inspectRecordingLengths(mockTestId: string, options: { measure?: boolean; persist?: boolean } = {}): Promise<RecordingReport[]> {
  const passages: PassageAudio[] = await prisma.passage.findMany({
    where: { mockTestId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, audioPath: true, audioUrl: true, audioFileName: true, audioMimeType: true, audioDurationSeconds: true },
  });

  const bySource = new Map<string, PassageAudio[]>();
  for (const passage of passages) {
    const src = resolvePassageAudioSrc(passage);
    if (!src) continue;
    bySource.set(src, [...(bySource.get(src) ?? []), passage]);
  }

  const reports: RecordingReport[] = [];
  for (const [src, rows] of bySource) {
    const storedSeconds = rows.find((row) => row.audioDurationSeconds != null)?.audioDurationSeconds ?? null;
    const report: RecordingReport = { src, passageIds: rows.map((row) => row.id), storedSeconds, measuredSeconds: null, status: storedSeconds != null ? "stored" : "skipped" };
    if (storedSeconds == null && options.measure !== false) {
      const bytes = await readRecording(src);
      const seconds = bytes ? await measureAudioDurationSeconds(bytes, { mimeType: rows[0].audioMimeType, fileName: rows[0].audioFileName }) : null;
      report.measuredSeconds = seconds;
      report.status = seconds != null ? "measured" : "unreadable";
      if (seconds != null && options.persist !== false) await prisma.passage.updateMany({ where: { id: { in: report.passageIds } }, data: { audioDurationSeconds: seconds } });
    }
    reports.push(report);
  }
  return reports;
}

/**
 * Measures every recording of a Listening test that has no length yet and stores it (one measurement per distinct file: a recording shared
 * by the four parts is read once and written to all four). Returns the summed length of the distinct recordings, or null when the test has no
 * recording or one of them could not be measured - callers then use the old fixed Listening time.
 * `measure: false` only reads what is stored.
 */
export async function ensureRecordingLengths(mockTestId: string, options: { measure?: boolean } = {}): Promise<number | null> {
  const reports = await inspectRecordingLengths(mockTestId, options);
  if (reports.length === 0) return null;
  let total = 0;
  for (const report of reports) {
    const seconds = report.storedSeconds ?? report.measuredSeconds;
    if (seconds == null) return null; // one recording of the test is unmeasured: the whole length is unknown
    total += seconds;
  }
  return total;
}
