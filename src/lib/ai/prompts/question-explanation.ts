import { z } from "zod";

import { EXPLANATION_MAX_LENGTH } from "@/lib/exam/question-explanations";

/**
 * Phase M2 - the explanation of ONE question, written once for every student ("Explain more" and "What's the trap?"). It is a draft: a teacher reads it,
 * edits it and approves it before any student sees a word. The model is told to stay inside the passage and the answer key it is given.
 */

export const questionExplanationResponseSchema = z.object({
  explanation: z.string().max(EXPLANATION_MAX_LENGTH * 2),
  trap: z.string().max(EXPLANATION_MAX_LENGTH * 2),
  fix: z.string().max(EXPLANATION_MAX_LENGTH * 2),
});
export type QuestionExplanationResponse = z.infer<typeof questionExplanationResponseSchema>;

export const QUESTION_EXPLANATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    explanation: {
      type: "string",
      description:
        "Why the right answer is right, in simple English (B1-B2): 2 to 5 sentences. Point to the evidence with a SHORT quote copied exactly from the text, in quotation marks (at most 15 words). For True / False / Not Given (or Yes / No / Not Given) also say in one sentence each why the other two options are wrong. For a question that covers several numbers, one short line per number, each starting with the number and a colon.",
    },
    trap: {
      type: "string",
      description: "The typical mistake students make on THIS question (a paraphrase they miss, a distractor that looks right, a detail that is not what is asked, True/False confused with Not Given ...) - 1 to 3 sentences.",
    },
    fix: {
      type: "string",
      description: "How to avoid that mistake next time: one concrete technique - 1 to 2 sentences.",
    },
  },
  required: ["explanation", "trap", "fix"],
  additionalProperties: false,
} as const;

export type QuestionExplanationContext = {
  testType: "READING" | "LISTENING";
  passageTitle: string;
  passageText: string;
  questionTypeLabel: string;
  /** "7" or "22-26": the numbers the question covers, as the student sees them. */
  numberLabel: string;
  prompt: string;
  /** The choices / options / word list, one per line, already readable. */
  optionLines: string[];
  /** One line per question number: its right answer (alternatives included) and what it is about. */
  answerLines: string[];
  /** "Choose TWO" and the like: the letters are a set, in any order. */
  isSet: boolean;
  /** A True / False / Not Given task worded as Yes / No / Not Given. */
  yesNo: boolean;
  /** The words a teacher confirmed as the evidence, per question number. */
  evidenceLines: string[];
};

const SYSTEM_PROMPT = `You write the answer explanation of ONE IELTS Reading or Listening question for students who are reviewing their test. A teacher will read, edit and approve what you write before any student sees it.

Rules:
- Use ONLY the passage (or transcript) and the answer key you are given. Never invent facts, never contradict the key, never mention that you are an AI.
- Write in simple, clear English for IELTS learners at about B1-B2 level. No headings, no lists with symbols, no markdown.
- "explanation": say why the right answer is right and where the text says it. Quote the evidence briefly (a few words, copied exactly, in quotation marks). When the question is True / False / Not Given (or Yes / No / Not Given), also say, in one sentence each, why the other two options are wrong. When the question covers several numbers, give one short line per number: the number, a colon, then the reason.
- "trap": the typical mistake students make on THIS question. Be specific to this question, not general advice.
- "fix": one concrete way to avoid that mistake next time.
- Keep every field short enough to read in a small popover (under 900 characters).`;

export function buildQuestionExplanationPrompt(context: QuestionExplanationContext): { system: string; user: string } {
  const kind = context.testType === "LISTENING" ? "Listening transcript" : "Reading passage";
  const lines: string[] = [
    `${kind}${context.passageTitle ? ` - "${context.passageTitle}"` : ""}:`,
    `"""\n${context.passageText}\n"""`,
    "",
    `Question ${context.numberLabel} (${context.questionTypeLabel}${context.yesNo ? ", answered Yes / No / Not Given" : ""}):`,
    context.prompt.trim() || "(no text)",
  ];
  if (context.optionLines.length > 0) lines.push("", `Options:\n${context.optionLines.join("\n")}`);
  lines.push("", `${context.isSet ? "Right answers (any order)" : "Right answer"}:\n${context.answerLines.join("\n")}`);
  if (context.evidenceLines.length > 0) lines.push("", `Where the teacher says the answer is in the text:\n${context.evidenceLines.join("\n")}`);
  lines.push("", "Write the explanation, the trap and the fix.");
  return { system: SYSTEM_PROMPT, user: lines.join("\n") };
}
