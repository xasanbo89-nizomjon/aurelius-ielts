"use client";

import { createContext, useContext } from "react";

import {
  applyHighlightChangeAction,
  deleteNoteAction,
  markListeningAudioEndedAction,
  saveAnswerAction,
  saveNoteAction,
  submitAttemptAction,
  toggleFlagAction,
  updateLastSeenQuestionAction,
} from "@/actions/exam.actions";
import { toggleQuestionBookmarkAction } from "@/actions/bookmarks.actions";

/**
 * Everything the exam runner WRITES to the server, as one small set of functions it reaches through this context. A student's sitting uses the real server
 * actions (the default - nothing changes for students). The teacher's "Preview as student" provides `previewExamActions` instead: the very same runner,
 * with every one of those writes replaced by a function that does nothing, so a preview creates no attempt, no answer, no highlight, no note, no flag,
 * no bookmark and no study time.
 */
export type ExamActions = {
  saveAnswer: typeof saveAnswerAction;
  toggleFlag: typeof toggleFlagAction;
  updateLastSeenQuestion: typeof updateLastSeenQuestionAction;
  saveNote: typeof saveNoteAction;
  deleteNote: typeof deleteNoteAction;
  submitAttempt: (resultId: string) => Promise<unknown>;
  markListeningAudioEnded: typeof markListeningAudioEndedAction;
  toggleBookmark: typeof toggleQuestionBookmarkAction;
  applyHighlightChange: typeof applyHighlightChangeAction;
  /** Where "leave the test" goes: the student's dashboard - or, in a preview, back to the teacher's page. */
  exitHref: string;
  /** True in a preview: the screens may show that nothing is being saved. */
  preview: boolean;
};

export const realExamActions: ExamActions = {
  saveAnswer: saveAnswerAction,
  toggleFlag: toggleFlagAction,
  updateLastSeenQuestion: updateLastSeenQuestionAction,
  saveNote: saveNoteAction,
  deleteNote: deleteNoteAction,
  submitAttempt: submitAttemptAction,
  markListeningAudioEnded: markListeningAudioEndedAction,
  toggleBookmark: toggleQuestionBookmarkAction,
  applyHighlightChange: applyHighlightChangeAction,
  exitHref: "/student/dashboard",
  preview: false,
};

/** The preview's actions: nothing is sent anywhere. Handing in just goes back to where the teacher came from. */
export function previewExamActions(exitHref: string): ExamActions {
  let counter = 0;
  return {
    saveAnswer: async () => ({ success: true }),
    toggleFlag: async () => ({ success: true }),
    updateLastSeenQuestion: async () => undefined,
    saveNote: async () => ({ success: true }),
    deleteNote: async () => ({ success: true }),
    submitAttempt: async () => {
      window.location.assign(exitHref);
    },
    markListeningAudioEnded: async () => ({ success: false }),
    toggleBookmark: async () => ({ success: true, bookmarked: true }),
    // A highlight needs an id back from the server; here it is made up on the spot and never stored.
    applyHighlightChange: async (_resultId, change) => ({ success: true, ids: (change.adds ?? []).map(() => `preview-${Date.now().toString(36)}-${++counter}`) }),
    exitHref,
    preview: true,
  };
}

const ExamActionsContext = createContext<ExamActions>(realExamActions);
export const ExamActionsProvider = ExamActionsContext.Provider;
export const useExamActions = () => useContext(ExamActionsContext);
