import { z } from "zod";

import { EXPLANATION_MAX_LENGTH } from "@/lib/exam/question-explanations";

/**
 * Phase M3 - what the review of a question needs, asked for in ONE request when a test is published: where the answer is in the text (per question number), why the
 * right answer is right ("Explain more") and the typical mistake ("What's the trap?" + how to avoid it). The model names the WORDS of the evidence only; the server finds
 * them in the text itself (see locateQuote), so a quote that is not in the text is simply not stored.
 */

export const reviewContentResponseSchema = z.object({
  evidence: z.array(z.object({ number: z.number().int(), found: z.boolean(), quote: z.string() })).max(20),
  explanation: z.string().max(EXPLANATION_MAX_LENGTH * 2),
  trap: z.string().max(EXPLANATION_MAX_LENGTH * 2),
  fix: z.string().max(EXPLANATION_MAX_LENGTH * 2),
});
export type ReviewContentResponse = z.infer<typeof reviewContentResponseSchema>;

export const REVIEW_CONTENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    evidence: {
      type: "array",
      description: "One entry for EACH question number listed in the request, in order.",
      items: {
        type: "object",
        properties: {
          number: { type: "integer", description: "The question number, exactly as listed in the request." },
          found: { type: "boolean", description: "True only when the text states what is needed to answer this number (or, for a Not Given statement, when a closely related sentence exists). False when you cannot point at a sentence with certainty." },
          quote: { type: "string", description: "The shortest stretch of the text that holds the answer - normally one sentence, at most two - copied EXACTLY, character for character, from the text. No ellipses, no paraphrase, no added or changed words. Empty string when found is false." },
        },
        required: ["number", "found", "quote"],
        additionalProperties: false,
      },
    },
    explanation: {
      type: "string",
      description:
        "Why the right answer is right, in simple English (B1-B2): 2 to 5 sentences. Point to the evidence with a SHORT quote copied exactly from the text, in quotation marks (at most 15 words). For True / False / Not Given (or Yes / No / Not Given) also say in one sentence each why the other two options are wrong; when the right answer is Not Given, say why the text does not answer the statement. For a question that covers several numbers, one short line per number, each starting with the number and a colon.",
    },
    trap: { type: "string", description: "The typical mistake students make on THIS question (a paraphrase they miss, a distractor that looks right, a detail that is not what is asked, True/False confused with Not Given ...) - 1 to 3 sentences." },
    fix: { type: "string", description: "How to avoid that mistake next time: one concrete technique - 1 to 2 sentences." },
  },
  required: ["evidence", "explanation", "trap", "fix"],
  additionalProperties: false,
} as const;

export type ReviewContentContext = {
  testType: "READING" | "LISTENING";
  /** The text the question belongs to (a passage / a Listening part's transcript), or every text of the test with its title when the question has no single part. */
  texts: { title: string; text: string }[];
  questionTypeLabel: string;
  /** "7" or "22-26". */
  numberLabel: string;
  prompt: string;
  optionLines: string[];
  /** One line per question number: "22 (Paragraph B): iv" - its right answer and what it is about. */
  answerLines: string[];
  /** The question numbers to give evidence for. */
  numbers: number[];
  isSet: boolean;
  yesNo: boolean;
  /** The right answer is Not Given. */
  notGiven: boolean;
};

const SYSTEM_PROMPT = `You prepare the REVIEW of ONE IELTS Reading or Listening question for students who are looking back at their finished test. Two things: WHERE in the text the answer is, and a short explanation. Faithfulness to the text and to the answer key you are given is the only goal - never invent, paraphrase or improve anything, never contradict the key, never mention that you are an AI.

Evidence (one entry per question number you are asked about):
- Return the shortest stretch of the text that holds the answer: normally one sentence, at most two. Copy it EXACTLY, character for character, from the text you are given. No ellipses, no joining separate places, no changed or added words.
- Find the words of the text that support the right answer - not the question's own wording.
- If the right answer is "Not Given" (or you cannot find the place with certainty): give the most closely related sentence of the text if there is one, otherwise found = false and an empty quote. A wrong location is worse than none.
- For a question with several numbers, give a DIFFERENT place for each number where the text allows it.

Explanation, trap and fix - written in simple, clear English for IELTS learners at about B1-B2 level, no headings, no lists with symbols, no markdown, each under 900 characters:
- "explanation": say why the right answer is right and where the text says it, quoting the evidence briefly (a few words, exactly, in quotation marks). For True / False / Not Given (or Yes / No / Not Given) also say, in one sentence each, why the other two options are wrong. When the right answer is Not Given, say why the text does not answer the statement. When the question covers several numbers, give one short line per number: the number, a colon, then the reason.
- "trap": the typical mistake students make on THIS question. Specific, not general advice.
- "fix": one concrete way to avoid that mistake next time.`;

export function buildReviewContentPrompt(context: ReviewContentContext): { system: string; user: string } {
  const kind = context.testType === "LISTENING" ? "Listening transcript" : "Reading passage";
  const lines: string[] = [];
  context.texts.forEach((entry, index) => {
    lines.push(`${kind}${context.texts.length > 1 ? ` ${index + 1}` : ""}${entry.title ? ` - "${entry.title}"` : ""}:`, `"""\n${entry.text}\n"""`, "");
  });
  lines.push(`Question ${context.numberLabel} (${context.questionTypeLabel}${context.yesNo ? ", answered Yes / No / Not Given" : ""}):`, context.prompt.trim() || "(no text)");
  if (context.optionLines.length > 0) lines.push("", `Options:\n${context.optionLines.join("\n")}`);
  lines.push("", `${context.isSet ? "Right answers (any order)" : "Right answer"}:\n${context.answerLines.join("\n")}`);
  if (context.notGiven) lines.push("", "The right answer is NOT GIVEN: the text does not say whether the statement is true or false.");
  lines.push("", `Give evidence for these question numbers: ${context.numbers.join(", ")}.`, "Then write the explanation, the trap and the fix.");
  return { system: SYSTEM_PROMPT, user: lines.join("\n") };
}
