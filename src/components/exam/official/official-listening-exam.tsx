"use client";

import "./official-exam.css";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

import { formatNumberRange } from "@/lib/exam/question-numbering";
import type { NavNumber } from "@/lib/exam/passage-groups";
import { examPreferencesCookie, textSizePx, type ExamPreferences } from "@/lib/exam/ui-preferences";
import { reviewCountdownText, type PartAudio } from "@/lib/exam/listening-audio";
import { parseRegion } from "@/lib/exam/text-highlight";
import { FallbackImage } from "@/components/ui/fallback-image";
import { OfficialAnnotations } from "@/components/exam/official/official-annotations";
import { OfficialFooter, partLabelOf } from "@/components/exam/official/official-footer";
import { OfficialHeader } from "@/components/exam/official/official-header";
import type { OfficialExamSession } from "@/components/exam/official/official-reading-exam";
import { OfficialQuestionGroups } from "@/components/exam/official/official-questions";
import { OfficialRangesContext } from "@/components/exam/official/official-text";
import { OfficialSubmitDialog } from "@/components/exam/official/official-submit-dialog";
import { OfficialChecking } from "@/components/exam/official/official-checking";
import { useListeningAudio, type ListeningAudioStatus } from "@/components/exam/official/use-listening-audio";

/**
 * What the Listening screen needs on top of what the Reading screen gets from the exam runner: where the recordings
 * are, how long ago the test started (by the SERVER's clock), and what to do when the recording and the review time
 * are over. Everything else - answers, flags, highlights, notes, autosave, position, submit - is the very same session.
 */
export type OfficialListeningSession = Omit<OfficialExamSession, "mobileTab" | "onMobileTabChange"> & {
  resultId: string;
  /** One entry per part, in order: the recording that belongs to it (null = none). */
  parts: PartAudio[];
  /** Seconds since "Start test" at the moment the server rendered this page. */
  elapsedSecondsAtRender: number;
  /** A timed test hands itself in when the 2 minutes to check the answers are over; an untimed one never does. */
  timed: boolean;
  goToSection: (index: number) => void;
  /** The recording and the 2 minutes to check the answers are over: hand the test in. */
  onReviewOver: () => void;
  /** The LAST recording finished (a Full Mock keeps the moment on the server). */
  onRecordingEnded: (src: string) => void;
};

const speaker = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
    <path d="M4 9.5v5h4l5 4v-13l-5 4H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);

/** The middle of the header: what the recording is doing now, and the review countdown at the end. */
function StatusClock({ status, percent, reviewRemaining }: { status: ListeningAudioStatus; percent: number; reviewRemaining: number | null }) {
  if (status === "review" || (status === "over" && reviewRemaining != null)) {
    const { text, warning } = reviewCountdownText(reviewRemaining ?? 0);
    // Not a live region (it changes every second): only the last minute and the end are spoken.
    const announcement = reviewRemaining === 60 ? "1 minute left to check your answers." : reviewRemaining === 0 ? "Time is up. Handing in your test." : "";
    return (
      <>
        <span role="timer" aria-live="off" className="ex-clock" data-warning={warning ? "true" : "false"} data-testid="review-clock">
          {text}
        </span>
        <span role="status" aria-live="assertive" className="ex-sr-only">
          {announcement}
        </span>
      </>
    );
  }
  const text =
    status === "loading"
      ? `Loading audio${percent > 0 ? ` ${percent}%` : "…"}`
      : status === "error"
        ? "The recording could not be loaded"
        : status === "blocked"
          ? "The recording is waiting for you"
          : status === "finished"
            ? "The recording has finished"
            : status === "over"
              ? "Time is up"
              : "Audio is playing";
  return (
    <span className="ex-clock ex-status" data-status={status} data-testid="audio-status" role="status" aria-live="polite">
      {status === "playing" && <span className="ex-status-icon">{speaker}</span>}
      {text}
    </span>
  );
}

/** The one control a student has over the recording. */
function Volume({ volume, onChange }: { volume: number; onChange: (value: number) => void }) {
  return (
    <label className="ex-volume">
      <span className="ex-volume-icon" aria-hidden="true">
        {speaker}
      </span>
      <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(event) => onChange(Number(event.target.value))} aria-label="Volume" data-testid="volume" />
    </label>
  );
}

function AudioBanner({ status, percent, error, onRetry, onResume }: { status: ListeningAudioStatus; percent: number; error: string | null; onRetry: () => void; onResume: () => void }): ReactNode {
  if (status === "loading") {
    return (
      <div className="ex-audio-banner" role="status" data-testid="audio-loading">
        <strong>Loading audio</strong>
        <span>{percent > 0 ? ` ${percent}%` : "…"} The recording starts by itself as soon as it is ready. You can already read the questions.</span>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="ex-audio-banner" role="alert" data-tone="error" data-testid="audio-error">
        <strong>{error ?? "The recording could not be loaded."}</strong>
        <span> Your answers are safe.</span>
        <button type="button" className="ex-button ex-button-primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (status === "blocked") {
    return (
      <div className="ex-audio-banner" role="alert" data-tone="notice" data-testid="audio-blocked">
        <strong>Your browser is waiting for a click before it plays the recording.</strong>
        <span> The recording carries on from where it should be.</span>
        <button type="button" className="ex-button ex-button-primary" onClick={onResume}>
          Continue the recording
        </button>
      </div>
    );
  }
  return null;
}

/**
 * The computer-delivered IELTS Listening screen: the same flat look, header, part bar, footer, submit dialog and
 * highlight / notes menu as the Reading screen, one pane of questions (there is no passage), and a recording that
 * plays once on its own - the student can change the volume and nothing else about it.
 */
export function OfficialListeningExam({ session }: { session: OfficialListeningSession }) {
  const [preferences, setPreferences] = useState(session.initialPreferences);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const changePreferences = useCallback(
    (next: ExamPreferences) => {
      setPreferences(next);
      try {
        document.cookie = examPreferencesCookie(session.preferencesCookieName, next, window.location.protocol === "https:");
      } catch {
        // Cookies blocked: the setting still applies for this sitting, it just is not remembered.
      }
    },
    [session.preferencesCookieName]
  );

  const { sections, sectionIndex, passageGroups, highlights, goToSection } = session;
  const section = sections[Math.min(sectionIndex, sections.length - 1)];
  const passage = section?.passage;
  const currentGroup = passageGroups.find((group) => group.passageId === passage?.id) ?? passageGroups[0];

  const audio = useListeningAudio({
    parts: session.parts,
    resultId: session.resultId,
    elapsedSecondsAtRender: session.elapsedSecondsAtRender,
    timed: session.timed,
    audioRef,
    onPartChange: goToSection,
    onRecordingEnded: session.onRecordingEnded,
    onOver: session.onReviewOver,
  });

  const partBar = currentGroup
    ? { label: partLabelOf(currentGroup), text: `Listen and answer ${currentGroup.firstNumber === currentGroup.lastNumber ? "question" : "questions"} ${formatNumberRange(currentGroup.firstNumber, currentGroup.lastNumber)}.` }
    : null;

  const selectNumber = useCallback((item: NavNumber) => session.goToQuestion(item.questionId, item.number), [session]);

  // The menu and "Clear all" act on the part on screen.
  const partQuestionIds = useMemo(() => new Set((section?.questions ?? []).map((row) => row.id)), [section]);
  const inCurrentPart = useCallback(
    (region: string) => {
      const parsed = parseRegion(region);
      if (!parsed) return false;
      return parsed.kind === "passage" ? parsed.passageId === passage?.id : partQuestionIds.has(parsed.questionId);
    },
    [passage?.id, partQuestionIds]
  );

  return (
    <div ref={setRoot} className="official-exam" data-contrast={preferences.contrast} data-text-size={preferences.textSize} data-skill="listening" style={{ fontSize: `${textSizePx(preferences.textSize)}px` }}>
      <OfficialHeader
        candidateName={session.candidateName}
        initialRemainingSeconds={session.initialRemainingSeconds}
        onExpire={session.onExpire}
        center={audio.status === "silent" ? undefined : <StatusClock status={audio.status} percent={audio.percent} reviewRemaining={audio.reviewRemaining} />}
        endExtra={audio.status === "silent" ? undefined : <Volume volume={audio.volume} onChange={audio.setVolume} />}
        preferences={preferences}
        onPreferencesChange={changePreferences}
      />

      {partBar && (
        <div className="ex-partbar" data-testid="part-bar">
          <strong>{partBar.label}</strong> {partBar.text}
        </div>
      )}

      <main className="ex-main" aria-label="Listening test">
        <div key={passage?.id ?? "questions"} className="ex-pane">
          <div className="ex-single">
            <AudioBanner status={audio.status} percent={audio.percent} error={audio.error} onRetry={audio.retry} onResume={audio.resume} />
            {audio.status === "silent" && (
              <div className="ex-audio-banner" role="status" data-testid="audio-none">
                <strong>There is no recording for this test.</strong>
                <span> Tell your teacher. You can still answer the questions.</span>
              </div>
            )}
            {(passage?.attachments ?? []).map((attachment) => (
              <figure key={attachment.id} className="ex-figure ex-figure-listening">
                <FallbackImage src={attachment.imagePath} alt={attachment.caption ?? "Exam visual material"} width={1200} height={800} sizes="(min-width: 1024px) 60vw, 100vw" unoptimized />
                {attachment.caption && <figcaption>{attachment.caption}</figcaption>}
              </figure>
            ))}
            <OfficialRangesContext.Provider value={highlights.rangesByRegion}>
              {/* A <fieldset disabled> locks every answer at once while the test is being handed in: anything typed after that could no longer be saved, so it must not look as if it had been. */}
              <fieldset ref={session.panelRef} disabled={session.submitting} className="ex-questions" onFocusCapture={session.onPanelInteraction} onPointerDownCapture={session.onPanelInteraction} onKeyDown={session.onAnswerKeyDown}>
                <OfficialQuestionGroups rows={section?.questions ?? []} groups={session.groups} answers={session.answers} onAnswer={session.onAnswer} />
              </fieldset>
            </OfficialRangesContext.Provider>
          </div>
        </div>
      </main>

      <OfficialFooter
        groups={passageGroups}
        activeNumber={session.activeNumber}
        openGroupKey={currentGroup?.key ?? ""}
        reviewChecked={session.flags.has(session.activeQuestionId)}
        onToggleReview={() => session.activeQuestionId && session.onToggleFlag(session.activeQuestionId)}
        onSelectNumber={selectNumber}
        onSelectGroup={session.goToPassage}
        onPrevious={session.onPrevious}
        onNext={session.onNext}
        hasPrevious={session.hasPrevious}
        hasNext={session.hasNext}
        onFinish={() => setFinishOpen(true)}
      />

      <OfficialSubmitDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        container={root}
        totalQuestions={session.totalQuestionCount}
        answeredCount={session.answeredCount}
        flaggedCount={session.flaggedCount}
        submitting={session.submitting}
        onConfirm={session.onSubmit}
      />

      {/* Select text, then right-click (or use the small button above the selection): Highlight | Notes | Clear | Clear all. */}
      <OfficialAnnotations
        root={root}
        highlights={highlights.highlights}
        onHighlight={highlights.addHighlights}
        onClear={highlights.clearRanges}
        onRemove={highlights.removeHighlights}
        onSetNote={highlights.setNote}
        onRemoveWhere={highlights.removeWhere}
        inCurrentPart={inCurrentPart}
      />

      {session.checking && <OfficialChecking />}

      {/* No controls, no download, no address on the screen: the page plays the recording and nobody else can touch it. */}
      <audio ref={audioRef} data-testid="exam-audio" hidden preload="auto" controlsList="nodownload noplaybackrate noremoteplayback" onContextMenu={(event) => event.preventDefault()} />
    </div>
  );
}
