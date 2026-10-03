import Link from "next/link";

import { textSizePx, type ExamPreferences } from "@/lib/exam/ui-preferences";

import "./official-exam.css";

/**
 * The screen before a Reading test begins, in the same flat style as the test itself: who is sitting
 * it, what it is, how long it lasts, and what the controls do. Starting is the same server action as
 * on the legacy page — nothing starts (and the clock does not run) until the button is pressed.
 * A server component: no client script is needed to read it.
 */
export function OfficialStartScreen({
  candidateName,
  title,
  description,
  minutes,
  questionCount,
  partCount,
  preferences,
  canStart,
  startAction,
}: {
  candidateName: string;
  title: string;
  description: string | null;
  /** The time allowed in minutes, or null for an untimed test. */
  minutes: number | null;
  questionCount: number;
  partCount: number;
  preferences: ExamPreferences;
  canStart: boolean;
  startAction: () => Promise<void>;
}) {
  return (
    <div className="ex-start" data-contrast={preferences.contrast} style={{ fontSize: `${textSizePx(preferences.textSize)}px` }}>
      <header className="ex-header">
        <div className="ex-brand">
          <span className="ex-brand-mark">Aurelius IELTS</span>
          <span className="ex-candidate">{candidateName}</span>
        </div>
      </header>

      <main className="ex-start-body">
        <p style={{ margin: 0, color: "var(--ex-muted)" }}>Reading</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}

        <dl className="ex-start-facts">
          <div>
            <dt>Candidate</dt>
            <dd>{candidateName}</dd>
          </div>
          <div>
            <dt>Time allowed</dt>
            <dd>{minutes ? `${minutes} minutes` : "No time limit"}</dd>
          </div>
          <div>
            <dt>Questions</dt>
            <dd>{questionCount}</dd>
          </div>
          <div>
            <dt>Parts</dt>
            <dd>{partCount}</dd>
          </div>
        </dl>

        <h2 style={{ margin: "0 0 0.25em", fontSize: "1.1em" }}>Before you begin</h2>
        <ul>
          <li>In each part, read the text on the left and answer the questions on the right.</li>
          <li>Use the numbers at the bottom of the screen to move between questions and parts. Tick &ldquo;Review&rdquo; to mark a question you want to come back to.</li>
          <li>To highlight text, select it and choose &ldquo;Highlight&rdquo;. Click a highlight to remove it.</li>
          <li>The menu at the top right changes the contrast and the text size.</li>
          <li>Your answers are saved as you go.</li>
          <li>{minutes ? "When the time is up, your answers are handed in automatically." : "This test has no time limit."}</li>
          <li>When you have finished, click the tick at the bottom right.</li>
        </ul>

        {canStart ? (
          <form action={startAction}>
            <button type="submit" className="ex-button ex-button-primary" style={{ padding: "0.7em 1.8em", fontSize: "1.05em" }}>
              Start test
            </button>
          </form>
        ) : (
          <>
            <p>Your free trial has ended. Upgrade or redeem a promo code to keep taking tests.</p>
            <Link href="/student/subscription?upgrade=1" className="ex-button ex-button-primary" style={{ display: "inline-block", textDecoration: "none" }}>
              Upgrade to Premium
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
