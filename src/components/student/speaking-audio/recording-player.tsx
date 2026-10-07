"use client";

import { useRef, useState } from "react";

import { getSpeakingAudioUrlAction } from "@/actions/speaking-audio.actions";

/**
 * Phase Q-B - plays one stored recording. The address it plays from is a short-lived signed link (the recordings are in a private bucket); when the link has run out -
 * the page was left open for a while - the player asks the server for a fresh one (the server checks again that this person may hear it) and carries on from where it was.
 */
export function RecordingPlayer({ practiceId, initialUrl, initialExpiresInSeconds, className }: { practiceId: string; initialUrl: string; initialExpiresInSeconds: number; className?: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const expiresAtRef = useRef(Date.now() + initialExpiresInSeconds * 1000);
  const refreshingRef = useRef(false);
  const failuresRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function refresh(resume: boolean, byError = false) {
    if (refreshingRef.current) return;
    // A link that was fresh and still does not play is not a matter of expiry: ask again only twice, then say so (no endless loop on a file that cannot be played).
    if (byError && ++failuresRef.current > 2) {
      setError("This recording cannot be played right now. Try again later.");
      return;
    }
    refreshingRef.current = true;
    const audio = audioRef.current;
    const position = audio?.currentTime ?? 0;
    try {
      const result = await getSpeakingAudioUrlAction(practiceId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      expiresAtRef.current = Date.now() + result.expiresInSeconds * 1000;
      setUrl(result.url);
      if (audio) {
        audio.addEventListener(
          "loadedmetadata",
          () => {
            audio.currentTime = position;
            if (resume) void audio.play().catch(() => {});
          },
          { once: true }
        );
      }
    } catch {
      setError("Could not reload the recording. Check your connection and press play again.");
    } finally {
      refreshingRef.current = false;
    }
  }

  return (
    <div className={className}>
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={url}
        className="w-full"
        data-testid="recording-player"
        onPlay={(event) => {
          // About to play with a link that has (nearly) run out: swap it first.
          if (Date.now() > expiresAtRef.current - 20_000) {
            event.currentTarget.pause();
            void refresh(true);
          }
        }}
        onError={() => void refresh(false, true)}
      />
      {error && (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
