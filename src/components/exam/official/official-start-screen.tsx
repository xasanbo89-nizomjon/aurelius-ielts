import Link from "next/link";
import type { ReactNode } from "react";

import { textSizePx, type ExamPreferences } from "@/lib/exam/ui-preferences";

import "./official-exam.css";

/**
 * The two screens before a Reading test begins, in the same flat style as the test itself.
 *
 *   1. "Confirm your details" - who is sitting which test. "My details are correct" is a plain link
 *      to the next screen: nothing is written, nothing starts.
 *   2. The instructions - module, time allowed, number of questions, a few lines on how the screen
 *      works. "Start test" is the ONLY thing that starts an attempt (the same server action as on the
 *      legacy page), so the clock - Result.startedAt - begins there and nowhere earlier.
 *
 * A student who already has a test in progress never sees either screen (the page sends them straight
 * back into it). Server components: no client script is needed to read them.
 */

export type OfficialPreTestStep = "details" | "instructions";

type Common = {
  candidateName: string;
  title: string;
  preferences: ExamPreferences;
};

function Shell({ candidateName, preferences, children }: Common & { children: ReactNode }) {
  return (
    <div className="ex-start" data-contrast={preferences.contrast} style={{ fontSize: `${textSizePx(preferences.textSize)}px` }}>
      <header className="ex-header">
        <div className="ex-brand">
          <span className="ex-brand-mark">Aurelius IELTS</span>
          <span className="ex-candidate">{candidateName}</span>
        </div>
      </header>
      <main className="ex-start-body">{children}</main>
    </div>
  );
}

/** A student whose free trial has ended cannot begin: the same message as the legacy page, instead of the button. */
function UpgradeNotice() {
  return (
    <>
      <p>Your free trial has ended. Upgrade or redeem a promo code to keep taking tests.</p>
      <Link href="/student/subscription?upgrade=1" className="ex-button ex-button-primary" style={{ display: "inline-block", textDecoration: "none" }}>
        Upgrade to Premium
      </Link>
    </>
  );
}

export function OfficialPreTest({
  step,
  candidateName,
  title,
  description,
  minutes,
  questionCount,
  preferences,
  canStart,
  instructionsHref,
  startAction,
}: Common & {
  step: OfficialPreTestStep;
  description: string | null;
  /** The time allowed in minutes, or null for an untimed test. */
  minutes: number | null;
  questionCount: number;
  canStart: boolean;
  /** Where "My details are correct" leads (the instructions screen). */
  instructionsHref: string;
  startAction: () => Promise<void>;
}) {
  if (step === "details") {
    return (
      <Shell candidateName={candidateName} title={title} preferences={preferences}>
        <h1>Confirm your details</h1>
        <dl className="ex-start-facts">
          <div>
            <dt>Candidate</dt>
            <dd data-testid="pretest-candidate">{candidateName}</dd>
          </div>
          <div>
            <dt>Test</dt>
            <dd data-testid="pretest-title">{title}</dd>
          </div>
        </dl>
        {description && <p>{description}</p>}
        {canStart ? (
          <>
            <p>Check that your name and the test are correct. If your name is wrong, tell your teacher before you begin.</p>
            <Link href={instructionsHref} className="ex-button ex-button-primary" style={{ display: "inline-block", padding: "0.7em 1.8em", fontSize: "1.05em", textDecoration: "none" }}>
              My details are correct
            </Link>
          </>
        ) : (
          <UpgradeNotice />
        )}
      </Shell>
    );
  }

  return (
    <Shell candidateName={candidateName} title={title} preferences={preferences}>
      <h1 data-testid="pretest-module">Reading</h1>
      <dl className="ex-start-facts">
        <div>
          <dt>Time allowed</dt>
          <dd data-testid="pretest-time">{minutes ? `${minutes} minutes` : "No time limit"}</dd>
        </div>
        <div>
          <dt>Questions</dt>
          <dd data-testid="pretest-questions">{questionCount} questions</dd>
        </div>
      </dl>

      <h2 style={{ margin: "0 0 0.25em", fontSize: "1.1em" }}>Instructions</h2>
      <ul>
        <li>Read the text on the left of each part and answer its questions on the right.</li>
        <li>Use the numbers at the bottom of the screen to move around. Tick &ldquo;Review&rdquo; to mark a question you want to come back to.</li>
        <li>To highlight text or add a note, select it, then right-click (or use the small button above the selection) and choose &ldquo;Highlight&rdquo; or &ldquo;Notes&rdquo;. &ldquo;Clear&rdquo; removes a highlight.</li>
        <li>Your answers are saved as you go. {minutes ? "When the time is up they are handed in automatically." : "There is no time limit."}</li>
        <li>When you have finished, click the tick at the bottom right.</li>
      </ul>

      {canStart ? (
        <form action={startAction}>
          <button type="submit" className="ex-button ex-button-primary" style={{ padding: "0.7em 1.8em", fontSize: "1.05em" }}>
            Start test
          </button>
        </form>
      ) : (
        <UpgradeNotice />
      )}
    </Shell>
  );
}
