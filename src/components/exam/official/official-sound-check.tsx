"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { usePreloadedTracks } from "@/components/exam/official/use-preloaded-tracks";
import { useStoredVolume } from "@/components/exam/official/use-stored-volume";

const SAMPLE_SRC = "/audio/sound-check.wav";

/**
 * The volume slider and the short sample of the sound check: "Put on your headphones and adjust the volume." The volume
 * chosen here is the volume the test starts with (it is kept for the next page). Used on its own screen before a
 * Listening test and inside the Full Mock start card; `onHeard` says the student has played the sample (or that it will not play).
 */
export function SoundCheckPanel({ onHeard, preload = [] }: { onHeard?: (heard: boolean) => void; preload?: readonly string[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useStoredVolume();
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const [broken, setBroken] = useState(false);

  // While the student adjusts the volume, the test's recordings load in the background.
  usePreloadedTracks(preload);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    onHeard?.(heard || broken);
  }, [heard, broken, onHeard]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    audio.currentTime = 0;
    audio.play().catch(() => setBroken(true));
  }

  return (
    <div className="ex-soundcheck" data-testid="sound-check">
      <p>
        <strong>Put on your headphones and adjust the volume.</strong>
      </p>
      <p>Play the sample and move the slider until you can hear it clearly and comfortably. You can change the volume again during the test.</p>
      <div className="ex-soundcheck-row">
        <button type="button" className="ex-button" onClick={toggle} aria-pressed={playing} data-testid="sample-play">
          {playing ? "Stop the sample" : heard ? "Play the sample again" : "Play the sample"}
        </button>
        <label className="ex-volume">
          <span className="ex-volume-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <path d="M4 9.5v5h4l5 4v-13l-5 4H4z" />
              <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
            </svg>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" data-testid="volume" />
        </label>
        <span role="status" aria-live="polite" data-testid="sample-status">
          {broken ? "The sample cannot be played. Check your sound, or tell your teacher." : playing ? "Playing…" : ""}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={SAMPLE_SRC}
        preload="auto"
        data-testid="sample-audio"
        onPlay={() => {
          setPlaying(true);
          setHeard(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setBroken(true)}
      />
    </div>
  );
}

/** Screen 2 of 3 before a Listening test. "Continue" opens the instructions once the sample has been played. */
export function SoundCheck({ continueHref, preload }: { continueHref: string; preload: readonly string[] }) {
  const [ready, setReady] = useState(false);
  return (
    <>
      <SoundCheckPanel onHeard={setReady} preload={preload} />
      {ready ? (
        <Link href={continueHref} className="ex-button ex-button-primary" style={{ display: "inline-block", padding: "0.7em 1.8em", fontSize: "1.05em", textDecoration: "none" }} data-testid="sound-continue">
          Continue
        </Link>
      ) : (
        <button type="button" className="ex-button ex-button-primary" style={{ padding: "0.7em 1.8em", fontSize: "1.05em" }} disabled data-testid="sound-continue">
          Continue
        </button>
      )}
    </>
  );
}

/**
 * "Start test" for a Listening test. The button is only live once the recordings are completely loaded - the clock of the
 * test starts with the recording, so nothing may be left to load after the press. A failed load can be tried again.
 */
export function ListeningStartForm({ action, sources }: { action: () => Promise<void>; sources: readonly string[] }) {
  const { status, percent, error, retry } = usePreloadedTracks(sources);
  const ready = status === "ready" || status === "idle";
  return (
    <form action={action}>
      {status === "loading" && (
        <p role="status" data-testid="start-audio-loading">
          Loading audio… {percent > 0 ? `${percent}%` : ""}
        </p>
      )}
      {status === "error" && (
        <p role="alert" data-testid="start-audio-error">
          {error ?? "The recording could not be loaded."}{" "}
          <button type="button" className="ex-button" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      {status === "idle" && sources.length === 0 && <p data-testid="start-audio-none">No recording is attached to this test yet. Tell your teacher before you begin.</p>}
      <button type="submit" className="ex-button ex-button-primary" style={{ padding: "0.7em 1.8em", fontSize: "1.05em" }} disabled={!ready} data-testid="start-test">
        Start test
      </button>
    </form>
  );
}
