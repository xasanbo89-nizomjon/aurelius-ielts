"use client";

import "./official-exam.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { examPreferencesCookie, textSizePx, type ExamPreferences } from "@/lib/exam/ui-preferences";
import { WRITING_DRAFT_MAX_CHARS, partLabelOfTask, writingRegion } from "@/lib/writing/constants";
import type { WritingExamPart } from "@/lib/writing/exam-part";
import { splitWritingInstructions } from "@/lib/writing/instructions";
import { countWords } from "@/lib/writing/word-count";
import type { SaveRequest } from "@/lib/writing/draft-engine";
import type { DraftSaveResult, HandInDraft } from "@/lib/writing/save-types";
import { useMediaQuery } from "@/components/exam/use-media-query";
import { OfficialAnnotations } from "@/components/exam/official/official-annotations";
import { OfficialHeader } from "@/components/exam/official/official-header";
import { OfficialSplit } from "@/components/exam/official/official-split";
import { OfficialText, type DrawnHighlight } from "@/components/exam/official/official-text";
import { OfficialWritingFooter } from "@/components/exam/official/official-writing-footer";
import { OfficialWritingSubmitDialog } from "@/components/exam/official/official-writing-submit-dialog";
import { OfficialWritingVisual } from "@/components/exam/official/official-writing-visual";
import { useLocalHighlights } from "@/components/exam/official/use-local-highlights";
import { useWritingDrafts } from "@/components/exam/official/use-writing-drafts";

export type { WritingExamPart };

export type HandInOutcome =
  | { ok: true; redirectTo: string }
  /** `behindTaskId`: the server holds newer text for that task (another window saved it) - nothing was handed in. */
  | { ok: false; error: string; behindTaskId?: string };

/** An automatic hand-in (the clock ran out) keeps trying while the connection is down; this many attempts, with growing pauses, are about two minutes. */
const AUTOMATIC_HAND_IN_ATTEMPTS = 12;
/** A hand-in that has not been answered after this long (it includes the marker's time) is treated as not having got through; trying again is safe because a hand-in is idempotent. */
const HAND_IN_TIMEOUT_MS = 100_000;
const EMPTY: readonly DrawnHighlight[] = [];

/**
 * Phase J - the official computer-delivered Writing screen. Used for a Writing task taken on its own (one part) and for the Writing
 * paper of a Full Mock (two parts, one clock): the same header, part bar, split screen with a draggable divider, footer, submit dialog,
 * contrast and text-size settings as Reading and Listening.
 *
 *   header      time left (counted on the server) and the display menu
 *   part bar    "Part 1   You should spend about 20 minutes on this task. Write at least 150 words."
 *   left        the task text (select it: right-click for Highlight | Notes | Clear) and, under it, the Task 1 picture (click to enlarge)
 *   right       a plain answer box - no spell check, no suggestions, no formatting; cut, copy, paste and undo work - and "Word count: N"
 *   footer      Part 1 | Part 2 (filled once something is written), previous / next, and the tick that hands the writing in
 *
 * Nothing here decides what is saved or when: that is the draft engine (lib/writing/draft-engine), which keeps a copy in the browser
 * on every keystroke, saves to the server in the background, retries when the connection drops and refuses to let an older window
 * overwrite newer text. There are no word-count warnings and no minimum length in the exam: an empty part is handed in as no response.
 */
export function OfficialWritingExam({
  candidateName,
  preferencesCookieName,
  initialPreferences,
  attemptKey,
  parts,
  initialRemainingSeconds,
  save,
  handIn,
  doneHref,
}: {
  candidateName: string;
  preferencesCookieName: string;
  initialPreferences: ExamPreferences;
  /** Names this sitting in the browser's storage and between tabs. */
  attemptKey: string;
  parts: WritingExamPart[];
  /** Whole seconds left, counted on the server; null = no clock (never handed in by itself). */
  initialRemainingSeconds: number | null;
  save: (request: SaveRequest) => Promise<DraftSaveResult>;
  handIn: (drafts: HandInDraft[]) => Promise<HandInOutcome>;
  /** Where this window goes if the writing turns out to be handed in already (from another tab). */
  doneHref: string;
}) {
  const router = useRouter();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [activeIndex, setActiveIndex] = useState(0);
  const [mobileTab, setMobileTab] = useState<"left" | "right">("left");
  const [finishOpen, setFinishOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { view, otherTabs, engine, setText } = useWritingDrafts({
    attemptKey,
    parts: parts.map(({ taskId, submissionId, content, updatedAt }) => ({ taskId, submissionId, content, updatedAt })),
    save,
  });
  const highlights = useLocalHighlights(`aurelius-writing-hl:v1:${attemptKey}`);

  const changePreferences = useCallback(
    (next: ExamPreferences) => {
      setPreferences(next);
      try {
        document.cookie = examPreferencesCookie(preferencesCookieName, next, window.location.protocol === "https:");
      } catch {
        // Cookies blocked: the setting still applies for this sitting, it just is not remembered.
      }
    },
    [preferencesCookieName]
  );

  const splits = useMemo(() => parts.map((part) => splitWritingInstructions(part.prompt, part.taskNumber)), [parts]);
  const active = parts[Math.min(activeIndex, parts.length - 1)];
  const split = splits[Math.min(activeIndex, parts.length - 1)];
  const activeText = view.texts[active.taskId] ?? "";
  const wordCount = countWords(activeText);
  const footerParts = parts.map((part) => ({ label: partLabelOfTask(part.taskNumber), answered: (view.texts[part.taskId] ?? "").trim().length > 0 }));
  const locked = submitting || view.timeUp || view.behind != null || view.handedInElsewhere;

  // ---- where the student is ---------------------------------------------------------------------------------------------
  const partKey = `aurelius-writing-part:${attemptKey}`;
  useEffect(() => {
    try {
      const stored = Number(window.sessionStorage.getItem(partKey));
      if (Number.isInteger(stored) && stored > 0 && stored < parts.length) setActiveIndex(stored);
    } catch {
      // storage blocked: start on the first part
    }
  }, [partKey, parts.length]);

  const boxes = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const caretPlaced = useRef(new Set<string>());
  const focusActiveBox = useCallback(() => {
    const box = boxes.current[active.taskId];
    if (!box || box.offsetParent === null) return; // not on screen (a phone showing the task)
    box.focus({ preventScroll: true });
    if (!caretPlaced.current.has(active.taskId)) {
      // Coming back to the sitting: the cursor waits at the end of what was written.
      caretPlaced.current.add(active.taskId);
      box.setSelectionRange(box.value.length, box.value.length);
      box.scrollTop = box.scrollHeight;
    }
  }, [active.taskId]);

  useEffect(() => {
    const frame = requestAnimationFrame(focusActiveBox);
    return () => cancelAnimationFrame(frame);
  }, [focusActiveBox, isDesktop, mobileTab]);

  const selectPart = useCallback(
    (index: number) => {
      if (index === activeIndex || index < 0 || index >= parts.length) return;
      engine.flushPart(active.taskId); // leaving a part saves it
      setActiveIndex(index);
      try {
        window.sessionStorage.setItem(partKey, String(index));
      } catch {
        // not remembered
      }
    },
    [activeIndex, parts.length, engine, active.taskId, partKey]
  );

  // ---- handing in -----------------------------------------------------------------------------------------------------
  const submittingRef = useRef(false);
  const aliveRef = useRef(true);
  // The hand-in function comes from the page that wraps this screen; reading it through a ref keeps `handInNow` (and the effects that call it) from being re-run when the page re-renders.
  const handInRef = useRef(handIn);
  handInRef.current = handIn;
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /**
   * The latest text is saved first, then both parts are handed in. `isAutomatic` (the clock ran out) never gives up quickly and never
   * asks: if the server holds newer text than this window (another window saved it) the server's text is what is handed in, because
   * the sitting is over. A manual hand-in that finds newer text elsewhere stops and says so instead.
   */
  const handInNow = useCallback(
    async (isAutomatic: boolean) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setAutomatic(isAutomatic);
      setFinishOpen(false);
      setNotice(null);

      await engine.flush(isAutomatic ? 6000 : 12_000);

      const useServerText = new Set<string>();
      const attempts = isAutomatic ? AUTOMATIC_HAND_IN_ATTEMPTS : 1;
      for (let attempt = 1; attempt <= attempts && aliveRef.current; attempt++) {
        const drafts: HandInDraft[] = engine.snapshot().map((draft) => (useServerText.has(draft.taskId) ? { taskId: draft.taskId } : draft));
        let outcome: HandInOutcome | null = null;
        try {
          outcome = await Promise.race([handInRef.current(drafts), new Promise<null>((resolve) => setTimeout(() => resolve(null), HAND_IN_TIMEOUT_MS))]);
        } catch {
          outcome = null;
        }
        if (outcome?.ok) {
          engine.finish();
          router.replace(outcome.redirectTo); // this window stays "handing in" until the next page replaces it
          return;
        }
        if (outcome && !outcome.ok && outcome.behindTaskId) {
          if (isAutomatic) {
            useServerText.add(outcome.behindTaskId);
            continue;
          }
          engine.markBehind(outcome.behindTaskId);
          break;
        }
        setNotice(outcome && !outcome.ok ? outcome.error : "Could not reach the server. Your writing is kept on this computer.");
        if (!isAutomatic) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(1500 * attempt, 10_000)));
      }
      if (!aliveRef.current) return;
      if (isAutomatic) setNotice("Your writing could not be handed in yet. It is kept on this computer. Check your connection, then click the tick at the bottom to try again.");
      submittingRef.current = false;
      setSubmitting(false);
    },
    [engine, router]
  );

  const onExpire = useCallback(() => void handInNow(true), [handInNow]);

  // The server can also be the first to know the time is up (a clock that runs behind): hand in then too.
  useEffect(() => {
    if (view.timeUp) void handInNow(true);
  }, [view.timeUp, handInNow]);

  // The writing was handed in from another tab: nothing is left to do here.
  useEffect(() => {
    if (view.handedInElsewhere) router.replace(doneHref);
  }, [view.handedInElsewhere, doneHref, router]);

  // ---- highlights and notes (on the task text only) -----------------------------------------------------------------
  const region = writingRegion(active.taskId);
  const inCurrentPart = useCallback((candidate: string) => candidate === region, [region]);
  const regionHighlights = highlights.rangesByRegion.get(region);
  const drawnHighlights = useMemo<readonly DrawnHighlight[]>(() => (regionHighlights ? regionHighlights.filter((h) => h.end <= split.body.length) : EMPTY), [regionHighlights, split.body.length]);

  // ---- panes ------------------------------------------------------------------------------------------------------------
  const taskPane = (
    <div key={active.taskId} className="ex-pane" data-testid="writing-task-panel">
      <div data-testid="writing-task-prompt">
        <OfficialText as="div" region={region} text={split.body} highlights={drawnHighlights} className="ex-passage-text" />
      </div>
      {active.image ? (
        <OfficialWritingVisual key={active.image.url} url={active.image.url} width={active.image.width} height={active.image.height} alt={`${partLabelOfTask(active.taskNumber)} picture`} container={root} />
      ) : active.visualDescription ? (
        <p className="ex-writing-visual-text">{active.visualDescription}</p>
      ) : null}
    </div>
  );

  const saveText = view.saveState === "offline" ? "Not saved yet - reconnecting…" : view.saveState === "saving" ? "Saving…" : "Saved";
  const answerPane = (
    <div className="ex-pane ex-answer-pane">
      {parts.map((part, index) => (
        <textarea
          key={part.taskId}
          ref={(element) => {
            boxes.current[part.taskId] = element;
          }}
          className="ex-answer-box"
          hidden={index !== activeIndex}
          value={view.texts[part.taskId] ?? ""}
          onChange={(event) => setText(part.taskId, event.target.value)}
          onBlur={() => engine.flushPart(part.taskId)}
          readOnly={locked}
          maxLength={WRITING_DRAFT_MAX_CHARS}
          // A plain box, as in the test: no spell check, no suggestions, nothing that rewrites what was typed.
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
          {...({ writingsuggestions: "false" } as Record<string, string>)}
          aria-label={`${partLabelOfTask(part.taskNumber)} answer`}
          data-testid={`writing-editor-task-${part.taskNumber === "TASK_1" ? 1 : 2}`}
        />
      ))}
      <div className="ex-answer-meta">
        <span data-testid="writing-word-count">Word count: {wordCount}</span>
        <span className="ex-save" role="status" aria-live="polite" data-state={view.saveState} data-testid="writing-save-state">
          {saveText}
        </span>
      </div>
    </div>
  );

  return (
    <div ref={setRoot} className="official-exam" data-contrast={preferences.contrast} data-text-size={preferences.textSize} style={{ fontSize: `${textSizePx(preferences.textSize)}px` }}>
      <OfficialHeader candidateName={candidateName} initialRemainingSeconds={initialRemainingSeconds} onExpire={onExpire} preferences={preferences} onPreferencesChange={changePreferences} />

      <div className="ex-partbar" data-testid="part-bar">
        <strong>{partLabelOfTask(active.taskNumber)}</strong> {split.line}
      </div>

      {view.behind && (
        <div className="ex-notice" role="alert" data-tone="warn" data-testid="writing-behind">
          <span>
            <strong>This test was changed in another window.</strong> To protect your writing, nothing more can be saved or handed in from this window.
          </span>
          <button type="button" className="ex-button" onClick={() => window.location.reload()}>
            Load the newest text
          </button>
          {view.unsavedWhenBehind.length > 0 && (
            <details>
              <summary>Show what I typed in this window</summary>
              {view.unsavedWhenBehind.map((item) => (
                <textarea key={item.taskId} readOnly value={item.text} aria-label="Text typed in this window that was not saved" />
              ))}
            </details>
          )}
        </div>
      )}
      {!view.behind && otherTabs > 0 && (
        <div className="ex-notice" role="status" data-testid="writing-other-tab">
          This test is also open in another tab or window. Please use only one, or the two could overwrite each other.
        </div>
      )}
      {!view.behind && view.saveState === "offline" && (
        <div className="ex-notice" role="status" data-tone="warn" data-testid="writing-offline">
          Your connection is down or slow. Keep writing: your text is kept on this computer and will be saved as soon as the connection returns.
        </div>
      )}
      {notice && !submitting && (
        <div className="ex-notice" role="alert" data-tone="warn" data-testid="writing-submit-notice">
          {notice}
        </div>
      )}

      <main className="ex-main" aria-label="Writing test" style={isDesktop ? undefined : { flexDirection: "column" }}>
        {isDesktop ? (
          <OfficialSplit left={taskPane} right={answerPane} leftLabel="Task" rightLabel="Your answer" />
        ) : (
          <>
            <div className="ex-tabs" role="tablist" aria-label="Task or answer">
              <button type="button" role="tab" className="ex-tab" aria-selected={mobileTab === "left"} onClick={() => setMobileTab("left")}>
                Task
              </button>
              <button type="button" role="tab" className="ex-tab" aria-selected={mobileTab === "right"} onClick={() => setMobileTab("right")}>
                Your answer
              </button>
            </div>
            <div className="ex-phone-pane" hidden={mobileTab !== "left"}>
              {taskPane}
            </div>
            <div className="ex-phone-pane" hidden={mobileTab !== "right"}>
              {answerPane}
            </div>
          </>
        )}
      </main>

      <OfficialWritingFooter
        parts={footerParts}
        activeIndex={activeIndex}
        onSelect={selectPart}
        onPrevious={() => selectPart(activeIndex - 1)}
        onNext={() => selectPart(activeIndex + 1)}
        onFinish={() => setFinishOpen(true)}
        finishDisabled={locked}
      />

      <OfficialWritingSubmitDialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        container={root}
        parts={footerParts}
        submitting={submitting}
        onConfirm={() => void handInNow(false)}
        onCloseAutoFocus={focusActiveBox}
      />

      {/* Select text of the task, then right-click (or use the small button above the selection): Highlight | Notes | Clear | Clear all. In the answer box the browser's own menu stays, so pasting works. */}
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

      {submitting && (
        <div className="ex-busy" role="status" data-testid="writing-submitting">
          <p>
            <strong>{automatic ? "Time is up. Handing in your writing…" : "Handing in your writing…"}</strong>
          </p>
          <p>Please keep this page open for a few seconds.</p>
          {notice && <p data-testid="writing-submit-notice">{notice}</p>}
        </div>
      )}
    </div>
  );
}
