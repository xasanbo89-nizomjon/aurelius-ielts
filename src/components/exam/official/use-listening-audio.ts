"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  LISTENING_REVIEW_SECONDS,
  buildTracks,
  followsParts,
  locateAudio,
  resolveAudioStartOffset,
  type PartAudio,
} from "@/lib/exam/listening-audio";
import { loadTrack, releaseTracks, type LoadedTrack } from "@/components/exam/official/audio-preload";
import { useStoredVolume } from "@/components/exam/official/use-stored-volume";

/**
 * silent    no recording is attached to this test
 * loading   the recording is being loaded
 * error     it could not be loaded (answers are untouched; "Try again" loads it again)
 * blocked   it is loaded but the browser wants a click before it will play (after a reload, mostly)
 * playing   the recording is playing
 * review    the recording is over; the 2 minutes to check the answers are running (timed tests)
 * finished  the recording is over and the test has no clock (untimed): nothing counts down, nothing is handed in by itself
 * over      recording and review time are both over
 */
export type ListeningAudioStatus = "silent" | "loading" | "error" | "blocked" | "playing" | "review" | "finished" | "over";

const startKey = (resultId: string) => `aurelius-listening-start:${resultId}`;

function readRemembered(resultId: string): number | null {
  try {
    const raw = window.localStorage.getItem(startKey(resultId));
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}
function remember(resultId: string, seconds: number) {
  try {
    window.localStorage.setItem(startKey(resultId), String(seconds));
  } catch {
    // Storage blocked: a reload then takes the recording to have started with the test.
  }
}

/**
 * The recording of an official Listening test.
 *
 * It plays ONCE, by itself, from the first recording to the last — no pause, no seeking, no replay (the element has no
 * controls, a pause that the system forces is undone, and so is a jump of the position). Where it is in the recording is
 * worked out from how long ago the test started on the server (`elapsedSecondsAtRender`), so a reload in the middle
 * carries on from the right place, and a page opened after the recording has ended goes straight to the review time.
 */
export function useListeningAudio({
  parts,
  resultId,
  elapsedSecondsAtRender,
  timed,
  audioRef,
  onPartChange,
  onRecordingEnded,
  onOver,
}: {
  parts: PartAudio[];
  resultId: string;
  /** Seconds since "Start test" when the server rendered the page. */
  elapsedSecondsAtRender: number;
  /** A timed test hands itself in when the review time is over; an untimed one never does. */
  timed: boolean;
  audioRef: RefObject<HTMLAudioElement | null>;
  /** The recording moved on to the recording of this part (only when every part has its own recording). */
  onPartChange?: (partIndex: number) => void;
  /** The LAST recording has finished (once). */
  onRecordingEnded?: (src: string) => void;
  /** Recording and review time are over (once, timed tests only). */
  onOver?: () => void;
}) {
  const tracks = useMemo(() => buildTracks(parts), [parts]);
  const following = useMemo(() => followsParts(tracks), [tracks]);

  const [status, setStatus] = useState<ListeningAudioStatus>(tracks.length === 0 ? "silent" : "loading");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reviewRemaining, setReviewRemaining] = useState<number | null>(null);
  const [volume, setVolume] = useStoredVolume();
  const [attempt, setAttempt] = useState(0);

  // Always the latest callbacks, without re-running the long-lived effects below.
  const callbacks = useRef({ onPartChange, onRecordingEnded, onOver, timed, following });
  callbacks.current = { onPartChange, onRecordingEnded, onOver, timed, following };

  const mountedAt = useRef<{ perf: number; date: number } | null>(null);
  const loadedTracks = useRef<LoadedTrack[]>([]);
  const startOffset = useRef(0);
  const trackIndex = useRef(0);
  const phase = useRef<ListeningAudioStatus>(status);
  const reviewEnd = useRef<number | null>(null);
  const programmatic = useRef(false);
  const lastTime = useRef(0);
  const overFired = useRef(false);
  const endedFired = useRef(false);

  const setPhase = useCallback((next: ListeningAudioStatus) => {
    phase.current = next;
    setStatus(next);
  }, []);

  /**
   * Seconds since "Start test", by the server's reckoning at render plus the time this page has been open. Two clocks measure the
   * time open and the larger one counts: the monotonic one stops while a laptop sleeps, the wall clock does not.
   */
  const nowElapsed = useCallback(() => {
    const opened = mountedAt.current;
    if (!opened) return elapsedSecondsAtRender;
    return elapsedSecondsAtRender + Math.max((performance.now() - opened.perf) / 1000, (Date.now() - opened.date) / 1000);
  }, [elapsedSecondsAtRender]);

  // ---- volume ---------------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, audioRef]);

  // ---- the review time -------------------------------------------------------------------------------------------------------
  const beginReview = useCallback(
    (endsAt: number) => {
      if (!callbacks.current.timed) {
        setPhase("finished");
        return;
      }
      reviewEnd.current = endsAt;
      setReviewRemaining(Math.max(0, Math.ceil(endsAt - nowElapsed())));
      setPhase("review");
    },
    [nowElapsed, setPhase]
  );

  useEffect(() => {
    const tick = () => {
      if (phase.current !== "review" || reviewEnd.current == null) return;
      const remaining = Math.ceil(reviewEnd.current - nowElapsed());
      if (remaining <= 0) {
        setReviewRemaining(0);
        setPhase("over");
        if (!overFired.current) {
          overFired.current = true;
          callbacks.current.onOver?.();
        }
      } else {
        setReviewRemaining((previous) => (previous === remaining ? previous : remaining));
      }
    };
    const interval = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [nowElapsed, setPhase]);

  // ---- playing -----------------------------------------------------------------------------------------------------------------
  const announceRecordingEnded = useCallback(() => {
    if (endedFired.current) return;
    endedFired.current = true;
    const last = tracks[tracks.length - 1];
    if (last) callbacks.current.onRecordingEnded?.(last.src);
  }, [tracks]);

  const playTrack = useCallback(
    (index: number, position: number) => {
      const audio = audioRef.current;
      const loaded = loadedTracks.current[index];
      if (!audio || !loaded) return;
      trackIndex.current = index;
      if (callbacks.current.following) callbacks.current.onPartChange?.(tracks[index].partIndexes[0]);

      programmatic.current = true;
      audio.src = loaded.url;
      audio.playbackRate = 1;
      const begin = () => {
        audio.currentTime = Math.min(Math.max(0, position), Math.max(0, loaded.duration - 0.05));
        lastTime.current = audio.currentTime;
        audio
          .play()
          .then(() => setPhase("playing"))
          .catch((reason: unknown) => {
            programmatic.current = false;
            if (reason instanceof DOMException && reason.name === "NotAllowedError") {
              setPhase("blocked");
            } else {
              setError("The recording could not be played.");
              setPhase("error");
            }
          });
      };
      audio.addEventListener("loadedmetadata", begin, { once: true });
      audio.load();
    },
    [audioRef, tracks, setPhase]
  );

  /** Puts the recording where the clock says it is, and plays on from there. */
  const applyTimeline = useCallback(() => {
    const durations = loadedTracks.current.map((track) => track.duration);
    const total = durations.reduce((sum, value) => sum + value, 0);
    const located = locateAudio(durations, nowElapsed() - startOffset.current);
    if (located.phase === "audio") {
      playTrack(located.trackIndex, located.position);
      return;
    }
    audioRef.current?.pause();
    announceRecordingEnded();
    if (located.phase === "review") {
      beginReview(startOffset.current + total + LISTENING_REVIEW_SECONDS);
    } else if (callbacks.current.timed) {
      reviewEnd.current = startOffset.current + total + LISTENING_REVIEW_SECONDS;
      setReviewRemaining(0);
      setPhase("over");
      if (!overFired.current) {
        overFired.current = true;
        callbacks.current.onOver?.();
      }
    } else {
      setPhase("finished");
    }
  }, [audioRef, nowElapsed, playTrack, beginReview, announceRecordingEnded, setPhase]);

  // Back on this tab after it was hidden or the machine slept: the recording belongs where the clock says it is.
  useEffect(() => {
    const onVisible = () => {
      const audio = audioRef.current;
      if (document.visibilityState !== "visible" || phase.current !== "playing" || !audio || loadedTracks.current.length === 0) return;
      const located = locateAudio(
        loadedTracks.current.map((track) => track.duration),
        nowElapsed() - startOffset.current
      );
      if (located.phase !== "audio" || located.trackIndex !== trackIndex.current || Math.abs(located.position - audio.currentTime) > 3) applyTimeline();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [audioRef, nowElapsed, applyTimeline]);

  // Load every recording, then start.
  useEffect(() => {
    if (tracks.length === 0) return;
    if (mountedAt.current == null) mountedAt.current = { perf: performance.now(), date: Date.now() };
    let cancelled = false;
    const bytes = tracks.map(() => ({ loaded: 0, total: 0 }));
    let lastPaint = 0;
    setPhase("loading");
    setError(null);
    setPercent(0);

    Promise.all(
      tracks.map((track, index) =>
        loadTrack(track.src, (loaded, total) => {
          bytes[index] = { loaded, total };
          const now = performance.now();
          if (now - lastPaint < 150) return;
          lastPaint = now;
          const sumLoaded = bytes.reduce((sum, item) => sum + item.loaded, 0);
          const sumTotal = bytes.reduce((sum, item) => sum + item.total, 0);
          if (!cancelled && sumTotal > 0) setPercent(Math.min(99, Math.round((sumLoaded / sumTotal) * 100)));
        })
      )
    ).then(
      (loaded) => {
        if (cancelled) return;
        loadedTracks.current = loaded;
        setPercent(100);
        const elapsed = nowElapsed();
        const remembered = readRemembered(resultId);
        startOffset.current = resolveAudioStartOffset({ elapsedAtLoad: elapsed, remembered });
        if (remembered == null) remember(resultId, startOffset.current);
        applyTimeline();
      },
      (reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "The recording could not be loaded.");
        setPhase("error");
      }
    );
    return () => {
      cancelled = true;
    };
    // `attempt` re-runs the load ("Try again"); everything else is stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, resultId, attempt]);

  // The element's own events: the next recording, and keeping the recording un-pausable and un-seekable.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      const next = trackIndex.current + 1;
      if (next < loadedTracks.current.length) {
        playTrack(next, 0);
        return;
      }
      announceRecordingEnded();
      beginReview(nowElapsed() + LISTENING_REVIEW_SECONDS);
    };
    const onPause = () => {
      // Nothing may pause the recording (a media key, a headset button, the browser's own menu): it just carries on.
      if (phase.current === "playing" && !audio.ended && !programmatic.current) {
        audio.play().catch(() => setPhase("blocked"));
      }
    };
    const onTimeUpdate = () => {
      if (!audio.seeking) lastTime.current = audio.currentTime;
    };
    const onSeeking = () => {
      if (programmatic.current) return;
      if (Math.abs(audio.currentTime - lastTime.current) > 0.6) {
        programmatic.current = true;
        audio.currentTime = lastTime.current;
      }
    };
    const onSeeked = () => {
      programmatic.current = false;
    };
    const onPlaying = () => {
      programmatic.current = false;
    };
    const onRateChange = () => {
      if (audio.playbackRate !== 1) audio.playbackRate = 1;
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("seeking", onSeeking);
    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ratechange", onRateChange);

    // Media keys and the system's media widget get no say either.
    const session = typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;
    const actions = ["play", "pause", "stop", "seekto", "seekbackward", "seekforward", "previoustrack", "nexttrack"] as const;
    if (session) {
      for (const action of actions) {
        try {
          session.setActionHandler(action, () => undefined);
        } catch {
          // This browser does not know that action.
        }
      }
    }
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("seeking", onSeeking);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ratechange", onRateChange);
      if (session) {
        for (const action of actions) {
          try {
            session.setActionHandler(action, null);
          } catch {
            // ignore
          }
        }
      }
      audio.pause();
    };
  }, [audioRef, playTrack, announceRecordingEnded, beginReview, nowElapsed, setPhase]);

  // Leaving the test frees the recordings' memory.
  useEffect(() => () => releaseTracks(), []);

  /** "Try again" after a failed load. */
  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  /** The click the browser wanted before it would play: carries on from where the clock says the recording is. */
  const resume = useCallback(() => {
    if (loadedTracks.current.length > 0) applyTimeline();
  }, [applyTimeline]);

  return { status, percent, error, retry, resume, volume, setVolume, reviewRemaining, tracks };
}
