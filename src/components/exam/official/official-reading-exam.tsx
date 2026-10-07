"use client";

import "./official-exam.css";

import { useCallback, useMemo, useState, type KeyboardEvent, type RefObject, type SyntheticEvent } from "react";

import { formatNumberRange } from "@/lib/exam/question-numbering";
import type { NavNumber, PassageGroup } from "@/lib/exam/passage-groups";
import type { QuestionGroupInfo } from "@/lib/exam/question-groups";
import { examPreferencesCookie, textSizePx, type ExamPreferences } from "@/lib/exam/ui-preferences";
import { parseRegion, passageRegion } from "@/lib/exam/text-highlight";
import type { ExamPassage } from "@/components/exam/exam-runner";
import type { useExamHighlights } from "@/components/exam/highlight/use-exam-highlights";
import { useMediaQuery } from "@/components/exam/use-media-query";
import { OfficialAnnotations } from "@/components/exam/official/official-annotations";
import { OfficialHeader } from "@/components/exam/official/official-header";
import { OfficialFooter, partLabelOf } from "@/components/exam/official/official-footer";
import { OfficialPassage } from "@/components/exam/official/official-passage";
import { OfficialQuestionGroups, type OfficialRow } from "@/components/exam/official/official-questions";
import { OfficialRangesContext, type DrawnHighlight } from "@/components/exam/official/official-text";
import { OfficialSplit } from "@/components/exam/official/official-split";
import { OfficialSubmitDialog } from "@/components/exam/official/official-submit-dialog";
import { OfficialChecking } from "@/components/exam/official/official-checking";

type HighlightStore = ReturnType<typeof useExamHighlights>;

/**
 * Everything the official screen needs from the exam runner. The runner owns the attempt — answers,
 * flags, highlights, autosave, where the student is, submitting — and hands it over here; this
 * screen only DRAWS it. That is what keeps the two screens (official / legacy) on exactly the same
 * data, autosave and scoring.
 */
export type OfficialExamSession = {
  candidateName: string;
  initialRemainingSeconds: number | null;
  onExpire: () => void;
  preferencesCookieName: string;
  initialPreferences: ExamPreferences;

  sections: { passage: ExamPassage | undefined; questions: OfficialRow[] }[];
  sectionIndex: number;
  groups: QuestionGroupInfo[];
  passageGroups: PassageGroup[];
  activeNumber: number;
  activeQuestionId: string;

  answers: Record<string, unknown>;
  flags: ReadonlySet<string>;
  onAnswer: (questionId: string, value: unknown) => void;
  onToggleFlag: (questionId: string) => void;

  goToQuestion: (questionId: string, number?: number) => void;
  goToPassage: (group: PassageGroup) => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;

  highlights: HighlightStore;

  panelRef: RefObject<HTMLFieldSetElement | null>;
  onPanelInteraction: (event: SyntheticEvent) => void;
  onAnswerKeyDown: (event: KeyboardEvent<HTMLElement>) => void;

  mobileTab: "left" | "right";
  onMobileTabChange: (tab: "left" | "right") => void;

  submitting: boolean;
  /** Phase M2 - the test is being handed in and its answers marked: show "Checking your answers..." (not inside a Full Mock, which marks nothing between papers, and not in a preview). */
  checking?: boolean;
  onSubmit: () => void;
  answeredCount: number;
  flaggedCount: number;
  totalQuestionCount: number;
};

const EMPTY: readonly DrawnHighlight[] = [];

export function OfficialReadingExam({ session }: { session: OfficialExamSession }) {
  const [preferences, setPreferences] = useState(session.initialPreferences);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

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

  const { sections, sectionIndex, passageGroups, highlights } = session;
  const section = sections[Math.min(sectionIndex, sections.length - 1)];
  const passage = section?.passage;
  const currentGroup = passageGroups.find((group) => group.passageId === passage?.id) ?? passageGroups[0];

  const partBar = currentGroup
    ? { label: partLabelOf(currentGroup), text: `Read the text and answer ${currentGroup.firstNumber === currentGroup.lastNumber ? "question" : "questions"} ${formatNumberRange(currentGroup.firstNumber, currentGroup.lastNumber)}.` }
    : null;

  const selectNumber = useCallback((item: NavNumber) => session.goToQuestion(item.questionId, item.number), [session]);

  // "Clear all" and the menu only act on the part on screen: its passage and the questions below it.
  const partQuestionIds = useMemo(() => new Set((section?.questions ?? []).map((row) => row.id)), [section]);
  const inCurrentPart = useCallback(
    (region: string) => {
      const parsed = parseRegion(region);
      if (!parsed) return false;
      return parsed.kind === "passage" ? parsed.passageId === passage?.id : partQuestionIds.has(parsed.questionId);
    },
    [passage?.id, partQuestionIds]
  );

  const passagePane = passage ? (
    <OfficialPassage
      key={passage.id}
      passageId={passage.id}
      title={passage.title}
      content={passage.content}
      attachments={passage.attachments}
      highlights={highlights.rangesByRegion.get(passageRegion(passage.id)) ?? EMPTY}
    />
  ) : (
    <div className="ex-pane">
      <p>This test has no passage for this part.</p>
    </div>
  );

  const questionsPane = (
    <OfficialRangesContext.Provider value={highlights.rangesByRegion}>
      <div key={passage?.id ?? "questions"} className="ex-pane">
        {/* A <fieldset disabled> locks every answer at once while the test is being handed in: anything typed after that could no longer be saved, so it must not look as if it had been. */}
        <fieldset ref={session.panelRef} disabled={session.submitting} className="ex-questions" onFocusCapture={session.onPanelInteraction} onPointerDownCapture={session.onPanelInteraction} onKeyDown={session.onAnswerKeyDown}>
          <OfficialQuestionGroups rows={section?.questions ?? []} groups={session.groups} answers={session.answers} onAnswer={session.onAnswer} />
        </fieldset>
      </div>
    </OfficialRangesContext.Provider>
  );

  return (
    <div ref={setRoot} className="official-exam" data-contrast={preferences.contrast} data-text-size={preferences.textSize} style={{ fontSize: `${textSizePx(preferences.textSize)}px` }}>
      <OfficialHeader candidateName={session.candidateName} initialRemainingSeconds={session.initialRemainingSeconds} onExpire={session.onExpire} preferences={preferences} onPreferencesChange={changePreferences} />

      {partBar && (
        <div className="ex-partbar" data-testid="part-bar">
          <strong>{partBar.label}</strong> {partBar.text}
        </div>
      )}

      <main className="ex-main" aria-label="Reading test" style={isDesktop ? undefined : { flexDirection: "column" }}>
        {isDesktop ? (
          <OfficialSplit left={passagePane} right={questionsPane} />
        ) : (
          <>
            <div className="ex-tabs" role="tablist" aria-label="Passage or questions">
              <button type="button" role="tab" className="ex-tab" aria-selected={session.mobileTab === "left"} onClick={() => session.onMobileTabChange("left")}>
                Passage
              </button>
              <button type="button" role="tab" className="ex-tab" aria-selected={session.mobileTab === "right"} onClick={() => session.onMobileTabChange("right")}>
                Questions
              </button>
            </div>
            <div className="ex-phone-pane" hidden={session.mobileTab !== "left"}>
              {passagePane}
            </div>
            <div className="ex-phone-pane" hidden={session.mobileTab !== "right"}>
              {questionsPane}
            </div>
          </>
        )}
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
    </div>
  );
}
