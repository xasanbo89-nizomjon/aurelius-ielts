import { z } from "zod";

/**
 * Phase M - "Suggest evidence with AI" in the answer-evidence editor. The model is asked for ONE thing: the exact words of the passage that hold the answer
 * to ONE question number. It never gives offsets (the server finds the words itself, see locateQuote) and what it returns is stored as a SUGGESTION that no
 * student sees until a teacher confirms it.
 */

export const evidenceSuggestionResponseSchema = z.object({
  found: z.boolean(),
  quote: z.string(),
});
export type EvidenceSuggestionResponse = z.infer<typeof evidenceSuggestionResponseSchema>;

export const EVIDENCE_SUGGESTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    found: {
      type: "boolean",
      description: "True only when the passage actually states what is needed to answer this question. False when it does not (for example a Not Given statement) or when you are not sure.",
    },
    quote: {
      type: "string",
      description: "The shortest stretch of the passage that holds the answer - normally one sentence, at most two - copied EXACTLY, character for character, from the passage. No ellipses, no paraphrase, no added or changed words. Empty string when found is false.",
    },
  },
  required: ["found", "quote"],
  additionalProperties: false,
} as const;

export type EvidenceSuggestionContext = {
  testType: "READING" | "LISTENING";
  passageTitle: string;
  passageText: string;
  /** The question number the evidence is for, as the student sees it. */
  questionNumber: number;
  questionTypeLabel: string;
  prompt: string;
  /** Answer choices / options / word list of the question, already as readable lines. Empty when it has none. */
  optionLines: string[];
  /** What this question number's right answer is, as text. */
  answerText: string;
  /** What this number is about inside a bigger question (a matching item, a summary blank). */
  targetLabel: string | null;
};

const SYSTEM_PROMPT = `You help an IELTS teacher find WHERE in a passage (or Listening transcript) the answer to ONE question can be found, so a student reviewing the test can be shown it. Faithfulness to the text is the only goal - never invent, paraphrase or improve anything.

Rules:
- Return the shortest stretch of the passage that holds the answer: normally one sentence, at most two. Copy it EXACTLY, character for character, from the passage text you are given. Do not use ellipses, do not join separate places, do not change or add a single word.
- The teacher gives you the right answer. Find the words of the passage that support that answer - not the question's own wording.
- If the passage does not state what is needed (for example a "Not Given" statement, or you cannot find it with certainty), answer found = false and an empty quote. A wrong location is worse than none.
- This is for a teacher to confirm before any student sees it.`;

export function buildEvidenceSuggestionPrompt(context: EvidenceSuggestionContext): { system: string; user: string } {
  const kind = context.testType === "LISTENING" ? "Listening transcript" : "Reading passage";
  const lines: string[] = [
    `${kind}${context.passageTitle ? ` - "${context.passageTitle}"` : ""}:`,
    `"""\n${context.passageText}\n"""`,
    "",
    `Question ${context.questionNumber} (${context.questionTypeLabel}): ${context.prompt.trim() || "(no text)"}`,
  ];
  if (context.targetLabel) lines.push(`This number is about: ${context.targetLabel}`);
  if (context.optionLines.length > 0) lines.push(`Options:\n${context.optionLines.join("\n")}`);
  lines.push(`Right answer: ${context.answerText}`);
  lines.push("", "Return the exact words of the passage that hold this answer.");
  return { system: SYSTEM_PROMPT, user: lines.join("\n") };
}
