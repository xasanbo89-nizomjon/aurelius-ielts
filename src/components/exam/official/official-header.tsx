"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { CONTRAST_OPTIONS, TEXT_SIZE_OPTIONS, type ExamPreferences } from "@/lib/exam/ui-preferences";
import { ExamTimer } from "@/components/exam/exam-timer";

/** In the last ten minutes the clock is drawn in the warning style. */
export const WARNING_SECONDS = 10 * 60;

/**
 * The clock, minutes AND seconds the whole way through: "59:32 left" (and "9:59 left" in the last ten minutes, in the warning style). `spoken` is the same time
 * in words for a screen reader. The seconds are derived from the server-anchored deadline by `ExamTimer`; only this text is drawn here.
 */
export function timeLeftText(remainingSeconds: number): { text: string; spoken: string; warning: boolean } {
  const total = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return {
    text: `${minutes}:${String(seconds).padStart(2, "0")} left`,
    spoken: `${plural(minutes, "minute")} ${plural(seconds, "second")} left`,
    warning: total <= WARNING_SECONDS,
  };
}

function Clock({ remaining, announcement }: { remaining: number | null; announcement: string }) {
  if (remaining == null) return <span className="ex-clock ex-clock-untimed">Untimed</span>;
  const text = timeLeftText(remaining);
  return (
    <>
      {/* Not a live region: it changes every second. The 5-minute / 1-minute / time's-up announcements below are. */}
      <span role="timer" aria-live="off" aria-label={text.spoken} className="ex-clock" data-warning={text.warning ? "true" : "false"} data-testid="exam-clock">
        {text.text}
      </span>
      <span role="status" aria-live="assertive" className="ex-sr-only">
        {announcement}
      </span>
    </>
  );
}

/**
 * The thin bar at the top: Aurelius mark and the candidate on the left, the time left in the
 * centre, the settings menu on the right. The countdown is the same `ExamTimer` the legacy screen
 * uses (server-anchored deadline, auto-submit only for a timed test that has really run out), only
 * drawn as text.
 */
export function OfficialHeader({
  candidateName,
  initialRemainingSeconds = null,
  onExpire = () => undefined,
  center,
  endExtra,
  preferences,
  onPreferencesChange,
}: {
  candidateName: string;
  initialRemainingSeconds?: number | null;
  onExpire?: () => void;
  /** Phase I - the Listening screen draws its own status in the middle ("Audio is playing", "2 minutes left to check your answers") instead of the countdown. */
  center?: ReactNode;
  /** Phase I - controls placed in front of the menu button (the Listening volume). */
  endExtra?: ReactNode;
  preferences: ExamPreferences;
  onPreferencesChange: (next: ExamPreferences) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="ex-header">
      <div className="ex-brand">
        <span className="ex-brand-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden="true">
            <path d="M3 9l9-5 9 5-9 5-9-5z" />
            <path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5" />
          </svg>
          Aurelius IELTS
        </span>
        <span className="ex-candidate" title={candidateName}>
          {candidateName}
        </span>
      </div>

      <div>
        {center ?? <ExamTimer durationSeconds={initialRemainingSeconds} onExpire={onExpire} render={({ remaining, announcement }) => <Clock remaining={remaining} announcement={announcement} />} />}
      </div>

      <div className="ex-header-end">
        {endExtra}
        <button
          ref={buttonRef}
          type="button"
          className="ex-icon-button"
          aria-label="Menu: contrast and text size"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-controls="ex-settings-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div ref={menuRef} id="ex-settings-menu" className="ex-menu" role="group" aria-label="Display settings">
          <fieldset>
            <legend>Contrast</legend>
            {CONTRAST_OPTIONS.map((option) => (
              <label key={option.value}>
                <input type="radio" name="ex-contrast" value={option.value} checked={preferences.contrast === option.value} onChange={() => onPreferencesChange({ ...preferences, contrast: option.value })} />
                {option.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Text size</legend>
            {TEXT_SIZE_OPTIONS.map((option) => (
              <label key={option.value}>
                <input type="radio" name="ex-text-size" value={option.value} checked={preferences.textSize === option.value} onChange={() => onPreferencesChange({ ...preferences, textSize: option.value })} />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>
      )}
    </header>
  );
}
