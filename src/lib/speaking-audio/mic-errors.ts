/**
 * Phase Q-B - what the microphone error of a browser means to a student, and what to do about it. Pure (the recorder passes the error it caught and the browser's
 * user-agent string), so every message can be checked without a browser.
 */

export type MicProblemCode = "denied" | "no-device" | "busy" | "insecure" | "unsupported" | "silent" | "unknown";

export type MicProblem = { code: MicProblemCode; message: string; steps: string[] };

export type Platform = "ios" | "android" | "mac-safari" | "chrome" | "firefox" | "edge" | "other";

export function platformOf(userAgent: string): Platform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/edg\//.test(ua)) return "edge";
  if (/firefox\//.test(ua)) return "firefox";
  if (/chrome\/|crios\//.test(ua)) return "chrome";
  if (/safari\//.test(ua)) return "mac-safari";
  return "other";
}

const DENIED_STEPS: Record<Platform, string[]> = {
  ios: [
    "Open Settings > Safari > Microphone (or Settings > Privacy & Security > Microphone) and allow it for this website.",
    "Go back to this page, reload it and press Allow when Safari asks.",
    "If Safari offers \"Ask\" / \"Allow\" for this site in the address bar (the aA menu > Website Settings), choose Allow.",
  ],
  android: [
    "Tap the lock icon next to the address, then Permissions > Microphone > Allow.",
    "If it is blocked for the whole browser: Settings > Apps > your browser > Permissions > Microphone > Allow.",
    "Reload the page.",
  ],
  "mac-safari": [
    "In the menu bar choose Safari > Settings > Websites > Microphone and set this website to Allow.",
    "Reload the page and press Allow when Safari asks.",
  ],
  chrome: ["Click the lock icon at the left of the address bar, switch Microphone on (Allow).", "Reload the page."],
  edge: ["Click the lock icon at the left of the address bar, switch Microphone on (Allow).", "Reload the page."],
  firefox: ["Click the microphone icon (or the lock) at the left of the address bar and remove the \"Blocked\" setting.", "Reload the page and choose Allow."],
  other: ["Allow the microphone for this website in your browser's settings (the lock icon next to the address), then reload the page."],
};

/** Turns whatever getUserMedia threw into a problem a student can act on. `error` is a DOMException-like object (only `name` is read). */
export function describeMicError(error: unknown, userAgent = ""): MicProblem {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  const platform = platformOf(userAgent);
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return { code: "denied", message: "The browser is not allowed to use your microphone for this page.", steps: DENIED_STEPS[platform] };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return { code: "no-device", message: "No microphone was found on this device.", steps: ["Plug in or switch on a microphone or headset.", "Check that it is selected as the input device in your system's sound settings.", "Press Try again."] };
  }
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") {
    return { code: "busy", message: "Your microphone is in use by another app or tab.", steps: ["Close other apps or tabs that use the microphone (video calls, recorders).", "Press Try again."] };
  }
  if (name === "InsecureContextError") {
    return { code: "insecure", message: "The microphone only works on a secure page (https).", steps: ["Open the site with its https:// address."] };
  }
  if (name === "UnsupportedError") {
    return {
      code: "unsupported",
      message: "This browser cannot record audio.",
      steps: platform === "ios" ? ["On iPhone and iPad use Safari (iOS 14.5 or newer) and update iOS if the problem stays."] : ["Use an up-to-date Chrome, Edge, Firefox or Safari."],
    };
  }
  return { code: "unknown", message: "Could not start the microphone.", steps: ["Check your microphone and the browser's permission for this page, then press Try again."] };
}

/** True when the page cannot use a microphone at all (a plain http page, or a browser with no recording support), before any permission is asked. */
export function micUnavailableReason(env: { isSecureContext: boolean; hasGetUserMedia: boolean; hasAudioContext: boolean }): "insecure" | "unsupported" | null {
  if (!env.isSecureContext) return "insecure";
  if (!env.hasGetUserMedia || !env.hasAudioContext) return "unsupported";
  return null;
}

/** The sentence under a recording that carries no sound (the microphone is muted or unplugged: the level meter never moved). */
export const SILENT_RECORDING_MESSAGE = "This recording is silent. Check that your microphone is not muted and is the selected input device, then record again.";
export const SILENT_PEAK_THRESHOLD = 0.01;
