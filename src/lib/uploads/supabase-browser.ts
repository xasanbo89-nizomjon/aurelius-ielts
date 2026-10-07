"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  UPLOAD_ATTEMPTS,
  UPLOAD_REPLY_SECONDS,
  UPLOAD_STALL_SECONDS,
  describeUploadFailure,
  isRetryableStatus,
  retryDelayMs,
  type UploadFailureKind,
} from "@/lib/uploads/upload-policy";

let cachedClient: SupabaseClient | null = null;

/**
 * The anon-key client, safe to run in the browser. The anon key itself grants
 * nothing on its own; per Supabase's docs a signed upload URL needs no bucket
 * RLS policy at all, since the token is the actual authorization.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  cachedClient = createClient(url, anonKey, { auth: { persistSession: false } });
  return cachedClient;
}

/** What an upload is doing, for the progress bar. `speedBytesPerSecond` is null until a few seconds of data have moved. */
export type UploadProgress = {
  state: "sending" | "finishing" | "waiting-to-retry";
  loaded: number;
  total: number;
  /** 0-100 */
  percent: number;
  attempt: number;
  attempts: number;
  speedBytesPerSecond: number | null;
  /** While `waiting-to-retry`: why the last try failed. */
  lastError?: string;
};

export type UploadOptions = {
  onProgress?: (progress: UploadProgress) => void;
  /** Cancels the upload (the file is not stored; nothing is retried). */
  signal?: AbortSignal;
};

/** A finished-for-good failure: `message` is one plain sentence meant to be shown as it is. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly kind: UploadFailureKind,
    readonly status: number = 0
  ) {
    super(message);
    this.name = "UploadError";
  }
}

type AttemptResult = { ok: true } | { ok: false; kind: UploadFailureKind; status: number; serverMessage: string };

function sendOnce(
  url: string,
  anonKey: string,
  file: File,
  onBytes: (loaded: number, total: number) => void,
  onBodySent: () => void,
  signal: AbortSignal | undefined
): Promise<AttemptResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (result: AttemptResult) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    // A connection that has gone quiet never says so: no byte for this long = the try is over (and may be repeated).
    const arm = (seconds: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // The verdict is given BEFORE the request is aborted: abort() fires onabort at once, which would otherwise claim the failure as "the connection was lost".
        done({ ok: false, kind: "stall", status: 0, serverMessage: "" });
        xhr.abort();
      }, seconds * 1000);
    };
    const onAbort = () => {
      done({ ok: false, kind: "cancelled", status: 0, serverMessage: "" });
      xhr.abort();
    };
    if (signal?.aborted) return done({ ok: false, kind: "cancelled", status: 0, serverMessage: "" });
    signal?.addEventListener("abort", onAbort);

    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      arm(UPLOAD_STALL_SECONDS);
      onBytes(event.loaded, event.lengthComputable ? event.total : file.size);
    };
    xhr.upload.onload = () => {
      onBodySent();
      arm(UPLOAD_REPLY_SECONDS);
    };
    xhr.onerror = () => done({ ok: false, kind: "network", status: 0, serverMessage: "" });
    xhr.onabort = () => done({ ok: false, kind: signal?.aborted ? "cancelled" : "network", status: 0, serverMessage: "" });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return done({ ok: true });
      let message = "";
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: unknown; error?: unknown };
        message = String(parsed.message ?? parsed.error ?? "");
      } catch {
        message = xhr.responseText.slice(0, 200);
      }
      done({ ok: false, kind: "http", status: xhr.status, serverMessage: message });
    };

    // The same request supabase-js makes for a signed upload (multipart: a cacheControl field and the file under an empty name), sent with XMLHttpRequest because
    // only that reports how many bytes have gone.
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    arm(UPLOAD_STALL_SECONDS);
    xhr.send(body);
  });
}

const wait = (ms: number, signal: AbortSignal | undefined) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done);
  });

/**
 * Uploads a file straight from the browser to Supabase Storage using a signed URL/token minted server-side - the file's bytes never touch the Next.js
 * server or any serverless function, which is what makes this safe for large files (up to 50MB of audio) that would otherwise hit the request-body ceiling.
 *
 * Phase Q: the upload reports its progress (`onProgress`), is given up on when no byte moves for 45 seconds, and is tried again (up to 3 times in all, the
 * same signed link) when the connection drops, stalls or the storage service has a hiccup. A refusal (bad or expired link, file too large) is not repeated.
 * Whatever happens, it ends: resolved, or rejected with an `UploadError` whose message is one plain sentence.
 */
export async function uploadToSignedUrl(bucket: string, path: string, token: string, file: File, contentType: string, options: UploadOptions = {}): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anonKey) throw new UploadError("Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.", "http", 0);

  const target = new URL(`${base.replace(/\/+$/, "")}/storage/v1/object/upload/sign/${bucket}/${path}`);
  target.searchParams.set("token", token);
  // The part keeps the file's own type; when the browser knows none (.m4a on some systems) the type chosen by the extension is used.
  const body = file.type ? file : new File([file], file.name, { type: contentType });

  const report = options.onProgress;
  let lastError = "";
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const delay = retryDelayMs(attempt);
      report?.({ state: "waiting-to-retry", loaded: 0, total: file.size, percent: 0, attempt, attempts: UPLOAD_ATTEMPTS, speedBytesPerSecond: null, lastError });
      await wait(delay, options.signal);
    }
    if (options.signal?.aborted) throw new UploadError(describeUploadFailure("cancelled"), "cancelled");

    const samples: { at: number; loaded: number }[] = [];
    const emit = (state: UploadProgress["state"], loaded: number, total: number) => {
      const now = Date.now();
      samples.push({ at: now, loaded });
      while (samples.length > 2 && now - samples[0].at > 6000) samples.shift();
      const first = samples[0];
      const seconds = (now - first.at) / 1000;
      const speed = seconds >= 2 && loaded > first.loaded ? (loaded - first.loaded) / seconds : null;
      report?.({ state, loaded, total, percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0, attempt, attempts: UPLOAD_ATTEMPTS, speedBytesPerSecond: speed });
    };
    emit("sending", 0, file.size);
    const result = await sendOnce(
      target.toString(),
      anonKey,
      body as File,
      (loaded, total) => emit("sending", loaded, total),
      () => emit("finishing", file.size, file.size),
      options.signal
    );
    if (result.ok) return;
    if (result.kind === "cancelled") throw new UploadError(describeUploadFailure("cancelled"), "cancelled");
    // A try that failed after the storage service had already kept the file: the repeated PUT finds it there. The path is unique to this upload, so it is ours.
    if (attempt > 1 && result.kind === "http" && result.status === 409) return;
    lastError = describeUploadFailure(result.kind, result.status, result.serverMessage);
    const retryable = result.kind !== "http" || isRetryableStatus(result.status);
    if (!retryable || attempt === UPLOAD_ATTEMPTS) throw new UploadError(lastError, result.kind, result.status);
  }
  throw new UploadError(describeUploadFailure("network"), "network");
}
