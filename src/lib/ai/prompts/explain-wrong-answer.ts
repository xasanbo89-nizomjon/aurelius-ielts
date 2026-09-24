import { z } from "zod";

/** Phase 20/23 — Test Results redesign, "Explain More" on a wrong answer. */
export const explainWrongAnswerResponseSchema = z.object({
  whyWrong: z.string().min(1),
  whyCorrect: z.string().min(1),
  keyKeywords: z.array(z.string().min(1)).min(1).max(8),
  ieltsStrategy: z.string().min(1),
  improvementAdvice: z.string().min(1),
});
export type ExplainWrongAnswerResponse = z.infer<typeof explainWrongAnswerResponseSchema>;

export const EXPLAIN_WRONG_ANSWER_JSON_SCHEMA = {
  type: "object",
  properties: {
    whyWrong: { type: "string", description: "A clear, specific explanation of why the student's given answer is incorrect for this question." },
    whyCorrect: { type: "string", description: "A clear, specific explanation of why the correct answer is right, referencing the question/passage context." },
    keyKeywords: {
      type: "array",
      items: { type: "string" },
      description: "3-8 specific keywords or phrases (from the question and/or passage) that matter most for locating/matching the correct answer.",
    },
    ieltsStrategy: { type: "string", description: "The specific IELTS exam-technique/strategy that applies to this question type (e.g. scanning for synonyms, eliminating extremes in True/False/Not Given, matching paragraph topics)." },
    improvementAdvice: { type: "string", description: "One or two concrete, actionable tips for avoiding this kind of mistake on future IELTS questions of this type." },
  },
  required: ["whyWrong", "whyCorrect", "keyKeywords", "ieltsStrategy", "improvementAdvice"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are a supportive, expert IELTS tutor reviewing one test question a student got wrong.
Rules:
- Be concrete and specific to THIS question — never generic test-taking advice unless it's the improvement tip.
- Address the student directly, in plain, encouraging language.
- Only state things that are actually true given the question, passage (if provided), options, the student's answer, and the correct answer. Never invent passage content you weren't given.
- keyKeywords must be real words/phrases that actually appear in the question or passage you were given — never invented.
- Respond only through the structured fields you are given; no extra commentary.`;

export function buildExplainWrongAnswerPrompt(input: {
  questionType: string;
  prompt: string;
  options: unknown;
  studentResponse: unknown;
  correctAnswer: unknown;
  passage?: string | null;
}): { system: string; user: string } {
  const user = `Question type: ${input.questionType}
${input.passage ? `Passage:\n${input.passage}\n\n` : ""}Question: ${input.prompt}
Answer options (if any): ${JSON.stringify(input.options)}
The student's answer: ${JSON.stringify(input.studentResponse)}
The correct answer: ${JSON.stringify(input.correctAnswer)}

Explain why the student's answer is wrong, why the correct answer is right, the key keywords that matter, the IELTS strategy for this question type, and improvement advice.`;

  return { system: SYSTEM_PROMPT, user };
}
