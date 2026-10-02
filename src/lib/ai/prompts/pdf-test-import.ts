import { z } from "zod";

const QUESTION_TYPE_VALUES = [
  "MULTIPLE_CHOICE",
  "TRUE_FALSE_NOT_GIVEN",
  "FILL_IN_BLANK",
  "MATCHING",
  "SHORT_ANSWER",
  "SENTENCE_COMPLETION",
  "SUMMARY_COMPLETION",
] as const;

const extractedChoiceSchema = z.object({ id: z.string(), text: z.string() });

const extractedItemSchema = z.object({
  number: z.number().int().positive(),
  prompt: z.string(),
  choices: z.array(extractedChoiceSchema),
});

const extractedQuestionGroupSchema = z.object({
  startNumber: z.number().int().positive(),
  endNumber: z.number().int().positive(),
  questionType: z.enum(QUESTION_TYPE_VALUES),
  instructions: z.string(),
  summaryText: z.string().nullable(),
  wordBank: z.array(z.string()),
  maxWords: z.number().int().positive().nullable(),
  matchingPrompts: z.array(extractedChoiceSchema),
  matchingOptions: z.array(extractedChoiceSchema),
  items: z.array(extractedItemSchema),
});

export const extractedPassageSchema = z.object({
  title: z.string(),
  content: z.string(),
  questionGroups: z.array(extractedQuestionGroupSchema),
});

const extractedAnswerSchema = z.object({
  number: z.number().int().positive(),
  answer: z.string(),
});

export const pdfTestExtractionResponseSchema = z.object({
  title: z.string(),
  passages: z.array(extractedPassageSchema),
  answers: z.array(extractedAnswerSchema),
});
export type PdfTestExtractionResponse = z.infer<typeof pdfTestExtractionResponseSchema>;
export type ExtractedPassage = z.infer<typeof extractedPassageSchema>;
export type ExtractedQuestionGroup = z.infer<typeof extractedQuestionGroupSchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type ExtractedChoice = z.infer<typeof extractedChoiceSchema>;

/** Phase 50.3 — the title + answer key are test-wide, extracted once from the full document regardless of how many passages it's split into for per-passage extraction (see buildSinglePassageExtractionPrompt). */
export const titleAndAnswersResponseSchema = z.object({
  title: z.string(),
  answers: z.array(extractedAnswerSchema),
});
export type TitleAndAnswersResponse = z.infer<typeof titleAndAnswersResponseSchema>;

const choiceJsonSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "A short stable id — the letter/numeral this choice is labeled with in the PDF (e.g. \"A\", \"B\", \"i\", \"1\")." },
    text: { type: "string" },
  },
  required: ["id", "text"],
  additionalProperties: false,
} as const;

const itemJsonSchema = {
  type: "object",
  properties: {
    number: { type: "integer", description: "This question's number exactly as printed in the PDF." },
    prompt: { type: "string", description: "This individual question's own statement/prompt text." },
    choices: {
      type: "array",
      items: choiceJsonSchema,
      description: "Only for MULTIPLE_CHOICE — this question's answer choices, each id being its printed letter (A, B, C, D). Empty array for every other question type.",
    },
  },
  required: ["number", "prompt", "choices"],
  additionalProperties: false,
} as const;

const questionGroupJsonSchema = {
  type: "object",
  properties: {
    startNumber: { type: "integer", description: "First question number in this block (e.g. 1 in \"Questions 1-5\")." },
    endNumber: { type: "integer", description: "Last question number in this block (e.g. 5 in \"Questions 1-5\")." },
    questionType: { type: "string", enum: QUESTION_TYPE_VALUES as unknown as string[] },
    instructions: { type: "string", description: "This block's own instruction text exactly as printed, e.g. \"Choose the correct letter, A, B, C or D.\"" },
    summaryText: {
      type: ["string", "null"],
      description:
        "ONLY for questionType SUMMARY_COMPLETION: the full connected summary/note/table-completion paragraph, with each blank written inline as its question number in brackets, e.g. \"Sales rose by [14] percent in the [15].\" Null for every other questionType.",
    },
    wordBank: {
      type: "array",
      items: { type: "string" },
      description: "A printed word bank/box of options for this block to choose from, if one exists. Empty array if none.",
    },
    maxWords: {
      type: ["integer", "null"],
      description: "A word-count limit if the instructions state one (e.g. \"NO MORE THAN TWO WORDS\" -> 2). Null if not stated.",
    },
    matchingPrompts: {
      type: "array",
      items: choiceJsonSchema,
      description:
        "ONLY for questionType MATCHING: one entry per question number in this block, in ascending order, each id being that question number as a string (e.g. \"6\"). Empty array for every other questionType.",
    },
    matchingOptions: {
      type: "array",
      items: choiceJsonSchema,
      description:
        "ONLY for questionType MATCHING: the fixed list being matched against (e.g. headings i-viii), each id being its printed label. Empty array for every other questionType.",
    },
    items: {
      type: "array",
      items: itemJsonSchema,
      description:
        "One entry per question number in [startNumber, endNumber] — REQUIRED (non-empty) for MULTIPLE_CHOICE, TRUE_FALSE_NOT_GIVEN, FILL_IN_BLANK, SHORT_ANSWER, SENTENCE_COMPLETION. Empty array for SUMMARY_COMPLETION and MATCHING, whose content lives in summaryText / matchingPrompts+matchingOptions instead.",
    },
  },
  required: [
    "startNumber",
    "endNumber",
    "questionType",
    "instructions",
    "summaryText",
    "wordBank",
    "maxWords",
    "matchingPrompts",
    "matchingOptions",
    "items",
  ],
  additionalProperties: false,
} as const;

export const passageJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "This passage/part's heading as printed, e.g. \"Reading Passage 1\" or \"Section 2\", plus its own title if one is given." },
    content: {
      type: "string",
      description:
        "The full body text of this passage. For a Listening PDF that only contains a transcript, use the transcript text here. If a Listening PDF has no transcript at all (only a question booklet), write a short honest note like \"No transcript included in this PDF — audio must be added separately.\"",
    },
    questionGroups: { type: "array", items: questionGroupJsonSchema },
  },
  required: ["title", "content", "questionGroups"],
  additionalProperties: false,
} as const;

export const answerJsonSchema = {
  type: "object",
  properties: {
    number: { type: "integer" },
    answer: { type: "string", description: "The correct answer exactly as printed in the answer key (e.g. \"C\", \"TRUE\", \"fascinated\")." },
  },
  required: ["number", "answer"],
  additionalProperties: false,
} as const;

/** Phase 50.3 — the per-passage-call schema: identical shape to one entry of PDF_TEST_EXTRACTION_JSON_SCHEMA's "passages" array, but as the TOP-LEVEL response. Used when the text has already been deterministically split at detected passage/section markers (see splitTextByMarkers) — the model only ever sees ONE passage's own text, so it is structurally impossible for it to merge passages, unlike asking it to self-segment the whole document in one call. */
export const SINGLE_PASSAGE_EXTRACTION_JSON_SCHEMA = passageJsonSchema;

export const TITLE_AND_ANSWERS_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "The overall test's title, e.g. \"Cambridge IELTS 18 Test 2 Reading\". If no clear title is printed, write a short reasonable one from the content.",
    },
    answers: {
      type: "array",
      items: answerJsonSchema,
      description:
        "Every question number -> correct answer found anywhere in this document's answer key section (often near the end, headed ANSWER KEY / ANSWERS / KEY / ANSWER SHEET), across ALL passages/sections combined. Empty array if no answer key section exists in the text — never invent an answer that isn't actually printed.",
    },
  },
  required: ["title", "answers"],
  additionalProperties: false,
} as const;

export const PDF_TEST_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "The overall test's title, e.g. \"Cambridge IELTS 18 Test 2 Reading\". If no clear title is printed, write a short reasonable one from the content.",
    },
    passages: {
      type: "array",
      items: passageJsonSchema,
      description: "One entry per Reading passage or per Listening part/section, in the order they appear.",
    },
    answers: {
      type: "array",
      items: answerJsonSchema,
      description:
        "Every question number -> correct answer found in the PDF's answer key section (often near the end, headed ANSWER KEY / ANSWERS / KEY / ANSWER SHEET). Empty array if no answer key section exists in the text — never invent an answer that isn't actually printed.",
    },
  },
  required: ["title", "passages", "answers"],
  additionalProperties: false,
} as const;

const QUESTION_GROUP_RULES = `- Identify every question block as one GROUP covering a contiguous range of question numbers sharing one instruction and one type (e.g. "Questions 1-5" is ONE group, not five). Never split a group into individual questions unless the source itself numbers them as fully independent single questions of that type.
- Classify each group's questionType as exactly one of: MULTIPLE_CHOICE, TRUE_FALSE_NOT_GIVEN, FILL_IN_BLANK, MATCHING, SHORT_ANSWER, SENTENCE_COMPLETION, SUMMARY_COMPLETION.
- For MULTIPLE_CHOICE, TRUE_FALSE_NOT_GIVEN, FILL_IN_BLANK, SHORT_ANSWER, SENTENCE_COMPLETION: fill "items" with one entry per question number in the group's range, each with its own prompt text (and choices, for MULTIPLE_CHOICE only, letter-labeled A/B/C/D...). Leave summaryText null and matchingPrompts/matchingOptions empty.
- For SUMMARY_COMPLETION: leave "items" empty. Instead fill "summaryText" with the full connected paragraph, writing each blank inline as its own question number in square brackets (e.g. "...rose by [14] percent...").
- For MATCHING: leave "items" empty. Instead fill "matchingPrompts" (one per question number, in order, id = that number as a string) and "matchingOptions" (the fixed list being matched against, e.g. headings, id = its printed label).`;

const ANSWER_KEY_RULE = `- Find the answer key — it is commonly a separate section near the end headed ANSWER KEY, ANSWERS, KEY, or ANSWER SHEET, mapping question numbers to correct answers. Extract every number -> answer pair you can find, exactly as printed. If genuinely no answer key exists anywhere in the text, return an empty answers array — do not fabricate answers from guessing at the question content.`;

const INTERNAL_REVIEW_NOTE = `- This is for internal teacher review only, not for a student to see — extract everything as accurately as possible so the teacher can verify it quickly rather than re-typing it by hand.`;

/**
 * Phase 50.3 — the whole-document, self-segmenting prompt. Used ONLY as the
 * fallback path when fewer than 2 passage/section markers were detected
 * (a genuinely single-passage/section document) — see
 * extractTestStructureFromPdfText. For 2+ detected markers, the pipeline no
 * longer asks one call to self-segment the whole document (that's the bug
 * this phase fixes); it deterministically splits the text first and calls
 * buildSinglePassageExtractionPrompt once per already-bounded segment,
 * which makes merging structurally impossible rather than just discouraged.
 */
const SYSTEM_PROMPT = `You are extracting the structure of a real IELTS Reading or Listening test from its raw PDF text, for a teacher who will review and edit every field before anything is saved. Faithfulness to the source text is the only goal — never invent, guess, or embellish content that isn't actually present.

Rules:
- Identify every passage (Reading) or part/section (Listening) in order, with its own full body text (or transcript, for Listening) — never another passage's text.
${QUESTION_GROUP_RULES}
- Every question group belongs to exactly the one passage/section its question numbers physically appear under in the source — never attach a question group to the wrong passage.
${ANSWER_KEY_RULE}
${INTERNAL_REVIEW_NOTE}`;

export function buildPdfTestExtractionPrompt(params: {
  testType: "READING" | "LISTENING";
  pdfText: string;
  detectedMarkers?: string[];
}): { system: string; user: string } {
  const lines: string[] = [];
  lines.push(`This is a ${params.testType === "READING" ? "Reading" : "Listening"} IELTS test PDF, extracted to plain text below.`);
  lines.push(`Raw PDF text:\n"""\n${params.pdfText}\n"""`);
  lines.push("Extract its full structure now using only the text above.");
  return { system: SYSTEM_PROMPT, user: lines.join("\n\n") };
}

const SINGLE_PASSAGE_SYSTEM_PROMPT = `You are extracting ONE passage/section of a real IELTS Reading or Listening test from a pre-isolated slice of its raw PDF text, for a teacher who will review and edit every field before anything is saved. Faithfulness to the source text is the only goal — never invent, guess, or embellish content that isn't actually present.

This text has ALREADY been split to contain exactly one passage/section — do not look for, expect, or reference any other passage. Extract only what is in the text below.

Rules:
- "content" is this one passage's full body text (or transcript, for Listening) — everything in the text below that is this passage's content.
${QUESTION_GROUP_RULES}
- Only include question groups whose numbers actually appear in this text — if this slice has no question groups at all, return an empty questionGroups array.
${INTERNAL_REVIEW_NOTE}`;

export function buildSinglePassageExtractionPrompt(params: { testType: "READING" | "LISTENING"; passageLabel: string; passageText: string }): {
  system: string;
  user: string;
} {
  const lines: string[] = [
    `This is one ${params.testType === "READING" ? "passage" : "section"} (header: "${params.passageLabel}") of an IELTS ${params.testType === "READING" ? "Reading" : "Listening"} test — already isolated from the rest of the document.`,
    `Text:\n"""\n${params.passageText}\n"""`,
    "Extract this one passage's structure now using only the text above.",
  ];
  return { system: SINGLE_PASSAGE_SYSTEM_PROMPT, user: lines.join("\n\n") };
}

const TITLE_AND_ANSWERS_SYSTEM_PROMPT = `You are extracting just two things from a real IELTS test PDF's raw text: its overall title, and its complete answer key. Ignore passage/question content entirely — another process already extracts that separately. Faithfulness to the source text is the only goal — never invent, guess, or embellish content that isn't actually present.

Rules:
- "title" is the overall test's title, e.g. "Cambridge IELTS 18 Test 2 Reading". If no clear title is printed, write a short reasonable one from the content.
${ANSWER_KEY_RULE} The answer key covers the WHOLE test (every passage/section combined, e.g. questions 1-40) — extract all of it in one flat list, not per-passage.
${INTERNAL_REVIEW_NOTE}`;

export function buildTitleAndAnswersExtractionPrompt(params: { testType: "READING" | "LISTENING"; pdfText: string }): { system: string; user: string } {
  const lines: string[] = [
    `This is a ${params.testType === "READING" ? "Reading" : "Listening"} IELTS test PDF, extracted to plain text below.`,
    `Raw PDF text:\n"""\n${params.pdfText}\n"""`,
    "Extract only the title and the full answer key now, using only the text above.",
  ];
  return { system: TITLE_AND_ANSWERS_SYSTEM_PROMPT, user: lines.join("\n\n") };
}
