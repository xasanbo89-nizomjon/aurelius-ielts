/**
 * Reads a real duration (whole seconds) from an audio File's own metadata,
 * client-side, via a throwaway `<audio>` element — never estimated from
 * file size. No "server-only" here on purpose: this runs in the browser,
 * right after a teacher picks a file, before it's even uploaded.
 */
export function getAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();

    function cleanup() {
      URL.revokeObjectURL(url);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("error", onError);
    }
    function onLoaded() {
      const seconds = Number.isFinite(audio.duration) ? Math.round(audio.duration) : null;
      cleanup();
      resolve(seconds);
    }
    function onError() {
      cleanup();
      resolve(null);
    }

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("error", onError);
    audio.src = url;
  });
}
