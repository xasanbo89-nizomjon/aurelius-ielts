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

export const extractedQuestionGroupSchema = z.object({
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

export const questionGroupJsonSchema = {
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

// ---------------------------------------------------------------------------
// Phase 50.4 — focused calls. The per-passage call in 50.3 still asked the model
// to enumerate EVERY question block of a passage in one response, and it would
// sometimes stop after the first (Passage 1 -> only Q1-5). Question blocks are
// now found by regex (detectQuestionGroupMarkers), so each block gets its own
// small call told exactly which numbers it must contain, and the passage text
// is extracted separately from the question blocks.
// ---------------------------------------------------------------------------

const noun = (testType: "READING" | "LISTENING") => (testType === "READING" ? "Reading" : "Listening");

export const passageBodyResponseSchema = z.object({ title: z.string(), content: z.string() });
export type PassageBodyResponse = z.infer<typeof passageBodyResponseSchema>;

export const PASSAGE_BODY_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "The passage's own title if it has one (e.g. \"The Return of the Wetlands\"), otherwise the heading as printed (e.g. \"Reading Passage 1\" or \"Section 2\")." },
    content: { type: "string", description: "The passage's full body text, copied faithfully, with its paragraph labels (A, B, C…) and a blank line between paragraphs. Excludes instructions, headers/footers, and all question blocks." },
  },
  required: ["title", "content"],
  additionalProperties: false,
} as const;

const PASSAGE_BODY_SYSTEM_PROMPT = `You are extracting the reading text of ONE passage (or the transcript of one Listening section) from a pre-isolated slice of a real IELTS test's raw PDF text, for a teacher who will review it before anything is saved. Copy the text faithfully — never summarise, reorder, add or invent anything.

Rules:
- "content" is the passage's full body text, keeping its paragraph labels (A, B, C…) and a blank line between paragraphs.
- Leave OUT: the paper instruction line ("You should spend about 20 minutes on Questions 1-13, which are based on Reading Passage 1 below."), headings such as "READING PASSAGE 1" or "Questions 1-13", page headers/footers and page numbers, and any question blocks, question instructions or answer key.
- "title" is the passage's own title if it has one (for example "The Return of the Wetlands"). If it has none, use the heading as printed (for example "Reading Passage 1" or "Section 2").
- For a Listening section where the slice contains no transcript at all (only questions), set "content" to exactly: "No transcript included in this PDF — audio must be added separately."`;

export function buildPassageBodyExtractionPrompt(params: { testType: "READING" | "LISTENING"; passageLabel: string; text: string }): { system: string; user: string } {
  return {
    system: PASSAGE_BODY_SYSTEM_PROMPT,
    user: [
      `This is the text of one ${params.testType === "READING" ? "passage" : "section"} (header: "${params.passageLabel}") of an IELTS ${noun(params.testType)} test.`,
      `Text:\n"""\n${params.text}\n"""`,
      "Extract this passage's title and body text now.",
    ].join("\n\n"),
  };
}

const QUESTION_TYPE_GUIDANCE = `Choose "questionType" as exactly one of: MULTIPLE_CHOICE (choose the letter), TRUE_FALSE_NOT_GIVEN (True/False/Not Given and Yes/No/Not Given blocks), MATCHING (matching headings, matching sentence endings, matching information or features to a list), SUMMARY_COMPLETION (ONE connected summary or passage with numbered blanks), FILL_IN_BLANK (notes, tables, forms or flow-charts with numbered blanks), SENTENCE_COMPLETION (separate sentences each with a blank), SHORT_ANSWER (questions answered in a few words).`;

function numberList(numbers: number[]): string {
  return numbers.join(", ");
}

export function questionNumberRange(startNumber: number, endNumber: number): number[] {
  const numbers: number[] = [];
  for (let n = startNumber; n <= endNumber; n++) numbers.push(n);
  return numbers;
}

export function buildQuestionGroupExtractionPrompt(params: {
  testType: "READING" | "LISTENING";
  passageLabel: string;
  startNumber: number;
  endNumber: number;
  groupText: string;
  /** Set on a retry: what was wrong with the earlier attempt ("missed 8–9", "typed it SUMMARY_COMPLETION instead of SHORT_ANSWER"…), so the model is told exactly what to fix rather than just asked again. */
  retryNotes?: string[];
  /** The type the block's printed instructions identify it as (inferQuestionTypeFromInstructions) — binding when present. */
  expectedType?: string | null;
}): { system: string; user: string } {
  const numbers = questionNumberRange(params.startNumber, params.endNumber);
  const list = numberList(numbers);
  const count = numbers.length;

  const system = `You are extracting ONE block of questions from a real IELTS ${noun(params.testType)} test, from a pre-isolated slice of its raw PDF text, for a teacher who will review every field before anything is saved. Faithfulness to the source text is the only goal — never invent, guess, or embellish content that is not actually present.

This slice has ALREADY been cut down to exactly one question block: questions ${params.startNumber} to ${params.endNumber} (${count} question${count === 1 ? "" : "s"}). Extract only this block. Ignore page headers and footers, running headings such as "READING PASSAGE 2", and any answer key.

Rules:
- Set "startNumber" to ${params.startNumber} and "endNumber" to ${params.endNumber}.
- "instructions" is the block's instruction text exactly as printed (for example "Choose the correct letter, A, B, C or D." together with any word limit such as "NO MORE THAN TWO WORDS"). Do not include the "Questions ${params.startNumber}-${params.endNumber}" heading itself, and do not include any of the questions.
- ${QUESTION_TYPE_GUIDANCE}
- For MULTIPLE_CHOICE, TRUE_FALSE_NOT_GIVEN, FILL_IN_BLANK, SHORT_ANSWER and SENTENCE_COMPLETION: "items" MUST contain exactly one entry for EVERY question number — ${list} — which is ${count} entr${count === 1 ? "y" : "ies"} in total, in order. Each entry holds that question's own prompt text (for notes or table rows with a blank, the line that contains the blank, with the blank shown as ..........) and, for MULTIPLE_CHOICE only, its answer choices labelled A, B, C, D. Never stop early and never skip a number. Leave "summaryText" null and "matchingPrompts" / "matchingOptions" empty.
- For SUMMARY_COMPLETION: leave "items" empty. Put the full connected summary in "summaryText", copied exactly as printed, with each numbered blank replaced by [n] (for example [${params.startNumber}]). NEVER turn separate questions or sentences into a summary, and never rewrite any text. If the block prints a list of words/phrases to choose from (often labelled A, B, C…), put the WORDS THEMSELVES in "wordBank" in printed order — for a box printed "A currents  B gravity  C cameras" return ["currents", "gravity", "cameras"] — never the letter labels.
- For FILL_IN_BLANK and SENTENCE_COMPLETION blocks that print a list of words to choose from, "wordBank" works the same way: the words themselves, in printed order, not their letters. Otherwise leave "wordBank" empty.
- For MATCHING: leave "items" empty. "matchingPrompts" MUST contain exactly one entry for EVERY number — ${list} — with id = the number as a string and text = what is being matched (for example "Paragraph B", or the beginning of the sentence). "matchingOptions" is the complete list being matched against (for example the List of Headings i-vii, or the sentence endings A-G), each id being its printed label and text its wording — include every option, even unused ones.
${INTERNAL_REVIEW_NOTE}`;

  const lines = [
    `This is one question block of ${params.passageLabel} of an IELTS ${noun(params.testType)} test.`,
    `Question block text:\n"""\n${params.groupText}\n"""`,
  ];
  if (params.expectedType) {
    lines.push(
      `The block's printed instructions identify it as ${params.expectedType}. Set "questionType" to exactly ${params.expectedType} and fill in the fields that type requires, using the questions exactly as they are printed.`
    );
  }
  if (params.retryNotes && params.retryNotes.length > 0) {
    lines.push(
      `IMPORTANT: a previous attempt on this block was wrong — it ${params.retryNotes.join("; and it ")}. Correct this. The block contains all of questions ${list}: return every one of them, with the right type, copying the printed text exactly.`
    );
  }
  lines.push("Extract this question block now.");
  return { system, user: lines.join("\n\n") };
}

export const missingQuestionsResponseSchema = z.object({ questionGroups: z.array(extractedQuestionGroupSchema) });
export type MissingQuestionsResponse = z.infer<typeof missingQuestionsResponseSchema>;

export const MISSING_QUESTIONS_JSON_SCHEMA = {
  type: "object",
  properties: {
    questionGroups: {
      type: "array",
      items: questionGroupJsonSchema,
      description: "Question blocks covering ONLY the missing question numbers that actually appear in the text. Empty array if none of them are in the text.",
    },
  },
  required: ["questionGroups"],
  additionalProperties: false,
} as const;

export function buildMissingQuestionsExtractionPrompt(params: {
  testType: "READING" | "LISTENING";
  passageLabel: string;
  missingNumbers: number[];
  text: string;
}): { system: string; user: string } {
  const list = numberList(params.missingNumbers);
  const system = `You are recovering question blocks that an earlier extraction pass missed from one passage/section of a real IELTS ${noun(params.testType)} test, working from its raw PDF text, for a teacher who will review every field before anything is saved. Faithfulness to the source text is the only goal — never invent, guess, or embellish content that is not actually present.

The only question numbers still missing are: ${list}.

Rules:
- Find the questions with exactly those numbers in the text and return them in "questionGroups". Numbers that belong to the same printed block (same heading, instructions and type) go in ONE group; separate blocks go in separate groups.
- Each group's startNumber/endNumber must cover ONLY numbers from the list above — never return any other number.
- If one of those numbers genuinely does not appear in the text, simply leave it out. Never make up a question.
- ${QUESTION_TYPE_GUIDANCE}
- For MULTIPLE_CHOICE, TRUE_FALSE_NOT_GIVEN, FILL_IN_BLANK, SHORT_ANSWER and SENTENCE_COMPLETION: "items" has one entry per question number in the group, each with that question's own prompt text (and, for MULTIPLE_CHOICE only, its choices labelled A, B, C, D). Leave "summaryText" null and "matchingPrompts" / "matchingOptions" empty.
- For SUMMARY_COMPLETION: leave "items" empty; put the full connected summary in "summaryText" with numbered blanks written inline as [n]; put any printed word list in "wordBank".
- For MATCHING: leave "items" empty; "matchingPrompts" has one entry per number (id = the number as a string); "matchingOptions" is the complete list being matched against, with every option's printed label as its id.
- "instructions" is the block's instruction text as printed, without the heading or any questions.
${INTERNAL_REVIEW_NOTE}`;

  return {
    system,
    user: [
      `This is the text of ${params.passageLabel} of an IELTS ${noun(params.testType)} test.`,
      `Text:\n"""\n${params.text}\n"""`,
      `Return the question blocks for the missing question numbers (${list}) now.`,
    ].join("\n\n"),
  };
}

// ---------------------------------------------------------------------------
// Phase A — focused answer-key recovery. The one-shot title+answers call reads
// the whole paper and sometimes drops entries (a compact key printed as
// "16 bags 17 Monday 18 pencils" lost 16–19 in a real run). The question
// numbers are known from the extraction, so the missing answers are asked for
// by number from just the answer-key text.
// ---------------------------------------------------------------------------

export const missingAnswersResponseSchema = z.object({ answers: z.array(extractedAnswerSchema) });
export type MissingAnswersResponse = z.infer<typeof missingAnswersResponseSchema>;

export const MISSING_ANSWERS_JSON_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: answerJsonSchema,
      description: "One entry for each requested question number whose answer is actually printed in the text. Leave out any number whose answer is not there.",
    },
  },
  required: ["answers"],
  additionalProperties: false,
} as const;

export function buildMissingAnswersExtractionPrompt(params: {
  testType: "READING" | "LISTENING";
  missingNumbers: number[];
  keyText: string;
}): { system: string; user: string } {
  const list = numberList(params.missingNumbers);
  const system = `You are recovering answer-key entries that an earlier pass missed from a real IELTS ${noun(params.testType)} test's answer key, for a teacher who will review every field before anything is saved. Faithfulness to the source text is the only goal — never invent, guess, or infer an answer from the question content.

The only question numbers whose answers are still missing are: ${list}.

Rules:
- Find the answer printed for exactly those numbers in the text and return them in "answers", each exactly as printed (a letter like "C", TRUE / FALSE / NOT GIVEN, a word or short phrase, a number).
- A key is often laid out compactly, several entries per line (e.g. "16 bags 17 Monday 18 pencils") or in a table — each number is followed by its own answer; read them apart carefully.
- Never return a number that is not in the list above. If one of those numbers has no answer in the text, simply leave it out.
${INTERNAL_REVIEW_NOTE}`;

  return {
    system,
    user: [`Answer key text:\n"""\n${params.keyText}\n"""`, `Return the answers for question numbers ${list} now, using only the text above.`].join("\n\n"),
  };
}
