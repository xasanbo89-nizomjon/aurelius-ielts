import { z } from "zod";

/**
 * Everything the model needs for exactly one question — never a full test.
 * `passageText` is already trimmed to one passage/transcript by the caller,
 * not the whole mock test, to keep token usage (and cost) proportional to a
 * single explanation.
 */
export type ExplainMoreContext = {
  skill: "READING" | "LISTENING";
  questionType: string;
  questionPrompt: string;
  optionsText: string | null;
  passageTitle: string | null;
  passageText: string | null;
  correctAnswerText: string;
  studentAnswerText: string;
};

export const explainMoreResponseSchema = z.object({
  whyCorrect: z.string().min(1),
  whyIncorrect: z.string().min(1),
  keywordEvidence: z.string().min(1),
  examStrategy: z.string().min(1),
  similarMistakeWarning: z.string().min(1),
});
export type ExplainMoreResponse = z.infer<typeof explainMoreResponseSchema>;

export const EXPLAIN_MORE_JSON_SCHEMA = {
  type: "object",
  properties: {
    whyCorrect: { type: "string", description: "Why the correct answer is correct, citing the passage/transcript." },
    whyIncorrect: { type: "string", description: "Why the student's specific answer is incorrect." },
    keywordEvidence: { type: "string", description: "The paraphrased or exact keywords in the passage/transcript that point to the answer." },
    examStrategy: { type: "string", description: "A short, actionable exam-technique tip for this question type." },
    similarMistakeWarning: { type: "string", description: "A one-sentence warning about the pattern of mistake, so the student avoids repeating it." },
  },
  required: ["whyCorrect", "whyIncorrect", "keywordEvidence", "examStrategy", "similarMistakeWarning"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are an expert IELTS tutor explaining exactly one exam question to a student who answered it incorrectly.
Rules:
- Only use information present in the supplied passage/transcript and question. Never invent facts.
- Be concise and specific — a few sentences per field, not essays.
- Address the student directly and encouragingly, but stay factual.
- Respond only through the structured fields you are given; do not add extra commentary.`;

export function buildExplainMorePrompt(context: ExplainMoreContext): { system: string; user: string } {
  const sections: string[] = [
    `Skill: ${context.skill === "LISTENING" ? "Listening" : "Reading"}`,
    `Question type: ${context.questionType}`,
  ];

  if (context.passageTitle || context.passageText) {
    sections.push(
      `${context.skill === "LISTENING" ? "Transcript" : "Passage"}${context.passageTitle ? ` ("${context.passageTitle}")` : ""}:\n${context.passageText ?? "(not provided)"}`
    );
  }

  sections.push(`Question: ${context.questionPrompt}`);
  if (context.optionsText) sections.push(`Options:\n${context.optionsText}`);
  sections.push(`Correct answer: ${context.correctAnswerText}`);
  sections.push(`Student's answer: ${context.studentAnswerText}`);
  sections.push(
    "Explain this to the student: why the correct answer is correct, why their answer is incorrect, the keyword evidence in the text, an exam strategy tip for this question type, and a warning about this mistake pattern."
  );

  return { system: SYSTEM_PROMPT, user: sections.join("\n\n") };
}
