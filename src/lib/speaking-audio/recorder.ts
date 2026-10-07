import { MAX_RECORDING_SECONDS, RECORDING_MIME_TYPE, RECORDING_SAMPLE_RATE } from "@/lib/speaking-audio/constants";
import { micUnavailableReason } from "@/lib/speaking-audio/mic-errors";
import { encodeWavPcm16, peakLevel, resample } from "@/lib/speaking-audio/wav";

/**
 * Phase Q-B - recording in the browser, for the Speaking practice. Browser only (every function here is called from a client component, after a click).
 *
 * The sound is captured as raw samples (a ScriptProcessor on the microphone stream) and written as a 16 kHz mono 16-bit WAV file at the end. That is the one format
 * the audio model accepts, it is the same in every browser (MediaRecorder gives WebM in Chrome and MP4 in Safari, and a serverless server cannot convert them), and a
 * 2-minute answer is under 4 MB. The AudioContext is created inside the click that asks for the microphone, which is what Safari and iOS require.
 */

type ContextConstructor = typeof AudioContext;

function contextConstructor(): ContextConstructor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: ContextConstructor }).webkitAudioContext ?? null;
}

/** Why this page cannot use a microphone at all (null = it can try). */
export function microphoneSupport(): "insecure" | "unsupported" | null {
  if (typeof window === "undefined") return "unsupported";
  return micUnavailableReason({
    isSecureContext: window.isSecureContext,
    hasGetUserMedia: Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function"),
    hasAudioContext: contextConstructor() != null,
  });
}

export type MicSession = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  sampleRate: number;
  /** The loudest recent sample, 0..1 (read it as often as you like; it does not re-render anything). */
  level: () => number;
  /** The loudest level since the session opened (the microphone check asks: was anything heard at all?). */
  peakSinceOpen: () => number;
  /** Releases the microphone (the browser's recording indicator goes off) and closes the audio context. */
  close: () => void;
};

/** Opens the microphone. Rejects with the browser's own error (its `name` says why: NotAllowedError, NotFoundError, NotReadableError...). Call it from a click. */
export async function openMicrophone(options: { onEnded?: () => void } = {}): Promise<MicSession> {
  const unavailable = microphoneSupport();
  if (unavailable) throw Object.assign(new Error(unavailable), { name: unavailable === "insecure" ? "InsecureContextError" : "UnsupportedError" });
  const Context = contextConstructor() as ContextConstructor;
  const context = new Context();
  // Started inside the click, before the permission question: Safari / iOS only let an audio context run when a gesture started it.
  void context.resume().catch(() => {});
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (error) {
    void context.close().catch(() => {});
    throw error;
  }
  if (context.state === "suspended") await context.resume().catch(() => {});

  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const frame = new Float32Array(analyser.fftSize);
  let peakSeen = 0;
  const level = () => {
    analyser.getFloatTimeDomainData(frame);
    const value = peakLevel(frame);
    if (value > peakSeen) peakSeen = value;
    return value;
  };
  if (options.onEnded) for (const track of stream.getAudioTracks()) track.addEventListener("ended", options.onEnded, { once: true });

  let closed = false;
  return {
    context,
    source,
    sampleRate: context.sampleRate,
    level,
    peakSinceOpen: () => peakSeen,
    close: () => {
      if (closed) return;
      closed = true;
      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
      for (const track of stream.getTracks()) track.stop();
      void context.close().catch(() => {});
    },
  };
}

/**
 * Keeps the screen from turning off while a student is preparing or speaking (a phone that locks its screen during a two-minute Part 2 talk stops the recording).
 * Returns the function that lets the screen go; where the browser has no such feature (or refuses), nothing happens.
 */
export async function keepScreenAwake(): Promise<() => void> {
  try {
    const wakeLock = (navigator as unknown as { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wakeLock) return () => {};
    const sentinel = await wakeLock.request("screen");
    return () => {
      void sentinel.release().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

export type Capture = { samples: Float32Array; sampleRate: number; seconds: number };

export type PcmRecorder = {
  /** How much has been recorded so far (the sample count is the truth; no timer is involved). */
  seconds: () => number;
  /** Ends the recording and returns what was captured, never more than `maxSeconds`. */
  stop: () => Capture;
  /** Ends the recording and drops everything. */
  cancel: () => void;
};

/** Starts capturing the open microphone. `onLimit` is called once, when `maxSeconds` of sound have been captured (the recorder keeps no more than that). */
export function startPcmRecorder(session: MicSession, options: { maxSeconds?: number; onLimit?: () => void } = {}): PcmRecorder {
  const maxSeconds = options.maxSeconds ?? MAX_RECORDING_SECONDS;
  const maxSamples = Math.floor(maxSeconds * session.sampleRate);
  const processor = session.context.createScriptProcessor(4096, 1, 1);
  const mute = session.context.createGain();
  mute.gain.value = 0;
  const chunks: Float32Array[] = [];
  let total = 0;
  let limitReported = false;
  let ended = false;

  processor.onaudioprocess = (event) => {
    if (ended) return;
    const input = event.inputBuffer.getChannelData(0);
    if (total < maxSamples) {
      const take = Math.min(input.length, maxSamples - total);
      chunks.push(input.slice(0, take));
      total += take;
    }
    if (total >= maxSamples && !limitReported) {
      limitReported = true;
      options.onLimit?.();
    }
  };
  // A script processor only runs while it is connected to the destination; the gain of zero keeps the speakers silent (no echo of the student's own voice).
  session.source.connect(processor);
  processor.connect(mute);
  mute.connect(session.context.destination);

  const detach = () => {
    ended = true;
    processor.onaudioprocess = null;
    try {
      session.source.disconnect(processor);
    } catch {
      // already disconnected
    }
    try {
      processor.disconnect();
      mute.disconnect();
    } catch {
      // already disconnected
    }
  };

  return {
    seconds: () => total / session.sampleRate,
    stop: () => {
      detach();
      const samples = new Float32Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        samples.set(chunk, offset);
        offset += chunk.length;
      }
      return { samples, sampleRate: session.sampleRate, seconds: total / session.sampleRate };
    },
    cancel: () => {
      detach();
      chunks.length = 0;
      total = 0;
    },
  };
}

export type EncodedRecording = {
  blob: Blob;
  bytes: number;
  /** The length of what is in the file. */
  seconds: number;
  /** The loudest sample of the recording, 0..1 (almost zero = a muted or unplugged microphone). */
  peak: number;
};

/** The captured samples as the file that is uploaded: 16 kHz, mono, 16-bit WAV. */
export function encodeCapture(capture: Capture): EncodedRecording {
  const mono = resample(capture.samples, capture.sampleRate, RECORDING_SAMPLE_RATE);
  const wav = encodeWavPcm16(mono, RECORDING_SAMPLE_RATE);
  return {
    blob: new Blob([wav as BlobPart], { type: RECORDING_MIME_TYPE }),
    bytes: wav.length,
    seconds: mono.length / RECORDING_SAMPLE_RATE,
    peak: peakLevel(capture.samples),
  };
}
