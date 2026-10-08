import Link from "next/link";
import type { ReactNode } from "react";

import { textSizePx, type ExamPreferences } from "@/lib/exam/ui-preferences";
import { ListeningStartForm, SoundCheck } from "@/components/exam/official/official-sound-check";

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

export type OfficialPreTestStep = "details" | "sound" | "instructions";

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
      <Link href="/student/premium?upgrade=1" className="ex-button ex-button-primary" style={{ display: "inline-block", textDecoration: "none" }}>
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
  module = "Reading",
  soundHref,
  audioSources = [],
  writing,
}: Common & {
  step: OfficialPreTestStep;
  description: string | null;
  /** The time allowed in minutes, or null for an untimed test. */
  minutes: number | null;
  questionCount: number;
  canStart: boolean;
  /** Where the screen after "My details are correct" is: the instructions (Reading) or, for Listening, the sound check. */
  instructionsHref: string;
  startAction: () => Promise<void>;
  /** Phase I - a Listening test has a sound check between the details and the instructions, and its recordings are loaded before it can be started. */
  module?: "Reading" | "Listening" | "Writing";
  soundHref?: string;
  audioSources?: readonly string[];
  /** Phase J - a Writing task taken on its own: which part it is and the length the test asks for. */
  writing?: {
    partLabel: string;
    minWords: number;
    /** Phase L3 - a Writing TEST (Task 1 + Task 2 in one sitting): one entry per part, with the time suggested for each. The instructions then speak of both parts. */
    parts?: { label: string; minWords: number; minutes: number }[];
  };
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
            <Link href={module === "Listening" && soundHref ? soundHref : instructionsHref} className="ex-button ex-button-primary" style={{ display: "inline-block", padding: "0.7em 1.8em", fontSize: "1.05em", textDecoration: "none" }}>
              My details are correct
            </Link>
          </>
        ) : (
          <UpgradeNotice />
        )}
      </Shell>
    );
  }

  if (step === "sound" && module === "Listening") {
    return (
      <Shell candidateName={candidateName} title={title} preferences={preferences}>
        <h1 data-testid="pretest-sound">Sound check</h1>
        {canStart ? <SoundCheck continueHref={instructionsHref} preload={audioSources} /> : <UpgradeNotice />}
      </Shell>
    );
  }

  if (module === "Listening") {
    return (
      <Shell candidateName={candidateName} title={title} preferences={preferences}>
        <h1 data-testid="pretest-module">Listening</h1>
        <dl className="ex-start-facts">
          <div>
            <dt>Time allowed</dt>
            <dd data-testid="pretest-time">{minutes ? "About 30 minutes" : "The length of the recording"}</dd>
          </div>
          <div>
            <dt>Questions</dt>
            <dd data-testid="pretest-questions">{questionCount} questions</dd>
          </div>
        </dl>

        <h2 style={{ margin: "0 0 0.25em", fontSize: "1.1em" }}>Instructions</h2>
        <ul>
          <li>You will hear the recording once only. It starts by itself when you press &ldquo;Start test&rdquo;. You cannot pause it, rewind it or play it again.</li>
          <li>Answer the questions as you listen. The screen moves to the next part when the recording does; use the numbers at the bottom of the screen to go back to an earlier part. Tick &ldquo;Review&rdquo; to mark a question you want to come back to.</li>
          <li>You can change the volume at any time with the slider at the top right.</li>
          <li>To highlight text or add a note, select it, then right-click (or use the small button above the selection) and choose &ldquo;Highlight&rdquo; or &ldquo;Notes&rdquo;. &ldquo;Clear&rdquo; removes a highlight.</li>
          <li>
            Your answers are saved as you go.{" "}
            {minutes ? "When the recording ends you have 2 minutes to check your answers; then they are handed in automatically." : "There is no time limit: when the recording ends, click the tick at the bottom right to hand in your answers."}
          </li>
          <li>When you have finished, click the tick at the bottom right.</li>
        </ul>

        {canStart ? <ListeningStartForm action={startAction} sources={audioSources} /> : <UpgradeNotice />}
      </Shell>
    );
  }

  if (module === "Writing" && writing) {
    return (
      <Shell candidateName={candidateName} title={title} preferences={preferences}>
        <h1 data-testid="pretest-module">Writing</h1>
        <dl className="ex-start-facts">
          <div>
            <dt>Time allowed</dt>
            <dd data-testid="pretest-time">{minutes ? `${minutes} minutes` : "No time limit"}</dd>
          </div>
          <div>
            <dt>Task</dt>
            <dd data-testid="pretest-questions">
              {writing.parts ? writing.parts.map((part) => `${part.label} · at least ${part.minWords} words`).join(" · ") : `${writing.partLabel} · at least ${writing.minWords} words`}
            </dd>
          </div>
        </dl>

        <h2 style={{ margin: "0 0 0.25em", fontSize: "1.1em" }}>Instructions</h2>
        <ul>
          <li>Read the task on the left of the screen and write your answer in the box on the right. Drag the line between them to give either side more room.</li>
          {writing.parts ? (
            <>
              <li>
                There are two parts and ONE clock for both: you have {minutes} minutes in all. {writing.parts.map((part) => `You should spend about ${part.minutes} minutes on ${part.label} and write at least ${part.minWords} words.`).join(" ")} How you share the time is up to you. The number of words you have written is shown under the box.
              </li>
              <li>Use the Part buttons at the bottom of the screen to move between the two parts. The clock keeps running, and what you have written in each part is kept.</li>
            </>
          ) : (
            <li>
              You should spend about {minutes} minutes on this task and write at least {writing.minWords} words. The number of words you have written is shown under the box.
            </li>
          )}
          <li>Your writing is saved as you type, and a small &ldquo;Saved&rdquo; appears under the box. If the connection is lost, keep writing: it is saved again when the connection returns.</li>
          <li>Spell check and suggestions are switched off, as in the real test. You can cut, copy, paste and undo.</li>
          <li>To highlight text in the task or add a note, select it, then right-click (or use the small button above the selection) and choose &ldquo;Highlight&rdquo; or &ldquo;Notes&rdquo;.</li>
          <li>{minutes ? "When the time is up your writing is handed in automatically." : "There is no time limit."} When you have finished, click the tick at the bottom right.</li>
        </ul>

        {canStart ? (
          <form action={startAction}>
            <button type="submit" className="ex-button ex-button-primary" style={{ padding: "0.7em 1.8em", fontSize: "1.05em" }} data-testid="start-test">
              Start test
            </button>
          </form>
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
