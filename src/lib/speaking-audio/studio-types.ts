import type { FeedbackLanguage, SpeakingPart } from "@/lib/speaking-audio/constants";

/**
 * Phase Q-B - the shapes the recording screen is built from. Plain data (no Date objects, no functions), so a server page can hand them to the client component.
 */

/** A published Speaking Topic as the question picker shows it: Part 1 and 3 have questions, Part 2 has a cue card. */
export type StudioTopic = {
  id: string;
  title: string;
  part: SpeakingPart;
  questions: { id: string; prompt: string }[];
  cue: { description: string; points: string[] } | null;
};

/** What the student is about to answer. */
export type PracticePrompt = {
  part: SpeakingPart;
  source: "OWN" | "TOPIC";
  topicId: string | null;
  questionId: string | null;
  /** The question, or the cue card's topic line (Part 2). */
  question: string;
  /** Part 2: the "You should say" points. */
  cueCardPoints: string[];
  feedbackLanguage: FeedbackLanguage;
};

/** `resetsInText` ("in 5 h 20 min") is worked out on the server and shown as it is, so the server's and the browser's first render read the same. */
export type AllowanceInfo = { limit: number; used: number; remaining: number; allowed: boolean; resetsAtIso: string; resetsInText: string };
