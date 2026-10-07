/**
 * Phase Q-B - the recording as a WAV file. Pure and client-safe (the browser records, then turns what it recorded into 16 kHz mono 16-bit PCM before it uploads):
 * the audio model accepts WAV and MP3 only, a browser's own recording is WebM or MP4 depending on the browser, and a server on a serverless platform has no
 * audio converter - so the conversion is done where the sound is, once, the same way in every browser. 2 minutes are under 4 MB.
 */

/** Mixes any number of channels down to one by averaging them. */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = Math.min(...channels.map((channel) => channel.length));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) sum += channel[i];
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * Resampling for speech. Going DOWN (a 44.1 or 48 kHz microphone to 16 kHz) every output sample is the average of the source samples it covers - a box filter, which
 * stops the highest frequencies of the microphone (the hiss of an "s" or "sh") from folding back into the speech band the way plain interpolation lets them. Going up
 * (not needed in practice) is linear interpolation.
 */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(length);
  if (ratio > 1) {
    for (let i = 0; i < length; i++) {
      const start = i * ratio;
      const end = Math.min(samples.length, start + ratio);
      const first = Math.floor(start);
      const last = Math.min(samples.length - 1, Math.ceil(end) - 1);
      let sum = 0;
      let weight = 0;
      for (let j = first; j <= last; j++) {
        const share = Math.min(j + 1, end) - Math.max(j, start);
        if (share > 0) {
          sum += samples[j] * share;
          weight += share;
        }
      }
      out[i] = weight > 0 ? sum / weight : samples[Math.min(samples.length - 1, first)];
    }
    return out;
  }
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const next = Math.min(samples.length - 1, index + 1);
    const fraction = position - index;
    out[i] = samples[index] * (1 - fraction) + samples[next] * fraction;
  }
  return out;
}

/** Floats in -1..1 to a 16-bit PCM WAV (RIFF header + data). */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/** The loudest sample, 0..1 (a level meter, and "the microphone is silent" detection). */
export function peakLevel(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i]);
    if (value > peak) peak = value;
  }
  return Math.min(1, peak);
}

/** What a recording looks like in the WAV header: the sample rate, the number of samples and so the length - or null when it is not a PCM WAV this module wrote. */
export function readWavInfo(bytes: Uint8Array): { sampleRate: number; samples: number; seconds: number } | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || tag(36) !== "data") return null;
  if (view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16) return null;
  const sampleRate = view.getUint32(24, true);
  const dataBytes = view.getUint32(40, true);
  const samples = Math.min(Math.floor(dataBytes / 2), Math.floor((bytes.length - 44) / 2));
  return sampleRate > 0 ? { sampleRate, samples, seconds: samples / sampleRate } : null;
}
