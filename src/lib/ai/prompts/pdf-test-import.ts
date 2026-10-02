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

const extractedPassageSchema = z.object({
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
export type ExtractedQuestionGroup = z.infer<typeof extractedQuestionGroupSchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;
export type ExtractedChoice = z.infer<typeof extractedChoiceSchema>;

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

const passageJsonSchema = {
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

const answerJsonSchema = {
  type: "object",
  properties: {
    number: { type: "integer" },
    answer: { type: "string", description: "The correct answer exactly as printed in the answer key (e.g. \"C\", \"TRUE\", \"fascinated\")." },
  },
  required: ["number", "answer"],
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

const SYSTEM_PROMPT = `You are extracting the structure of a real IELTS Reading or Listening test from its raw PDF text, for a teacher who will review and edit every field before anything is saved. Faithfulness to the source text is the only goal — never invent, guess, or embellish content that isn't actually present.

Rules:
- A full IELTS Reading test almost always has THREE separate passages (headed "PASSAGE 1" / "READING PASSAGE 1", "PASSAGE 2", "PASSAGE 3", or similar); a full Listening test almost always has FOUR separate sections/parts (headed "SECTION 1", "PART 1", etc.). Each numbered passage/section header starts a brand-new, separate entry in the "passages" array. NEVER merge two differently-numbered passages/sections into a single entry, even though their question ranges are contiguous (e.g. Passage 1 = Questions 1-13, Passage 2 = Questions 14-26, Passage 3 = Questions 27-40 is THREE entries, not one). A passage header commonly repeats as a running header on every page of that passage — this does not mean a new passage starts each time; it's the same passage until the number changes.
- Worked example: if the text contains "PASSAGE 1" ... (content) ... "Questions 1-13" ... "PASSAGE 2" ... (content) ... "Questions 14-26" ... "PASSAGE 3" ... (content) ... "Questions 27-40", you must return passages = [ {title: "Passage 1", content: <only Passage 1's text>, questionGroups: <only groups within 1-13>}, {title: "Passage 2", content: <only Passage 2's text>, questionGroups: <only groups within 14-26>}, {title: "Passage 3", ...} ] — three separate array entries, each with ONLY its own content and ONLY the question groups whose numbers fall inside that passage's range.
- Identify every passage (Reading) or part/section (Listening) in order, with its own full body text (or transcript, for Listening) — never another passage's text.
- Identify every question block as one GROUP covering a contiguous range of question numbers sharing one instruction and one type (e.g. "Questions 1-5" is ONE group, not five). Never split a group into individual questions unless the source itself numbers them as fully independent single questions of that type. Every question group belongs to exactly the one passage/section its question numbers physically appear under in the source — never attach a question group to the wrong passage.
- Classify each group's questionType as exactly one of: MULTIPLE_CHOICE, TRUE_FALSE_NOT_GIVEN, FILL_IN_BLANK, MATCHING, SHORT_ANSWER, SENTENCE_COMPLETION, SUMMARY_COMPLETION.
- For MULTIPLE_CHOICE, TRUE_FALSE_NOT_GIVEN, FILL_IN_BLANK, SHORT_ANSWER, SENTENCE_COMPLETION: fill "items" with one entry per question number in the group's range, each with its own prompt text (and choices, for MULTIPLE_CHOICE only, letter-labeled A/B/C/D...). Leave summaryText null and matchingPrompts/matchingOptions empty.
- For SUMMARY_COMPLETION: leave "items" empty. Instead fill "summaryText" with the full connected paragraph, writing each blank inline as its own question number in square brackets (e.g. "...rose by [14] percent...").
- For MATCHING: leave "items" empty. Instead fill "matchingPrompts" (one per question number, in order, id = that number as a string) and "matchingOptions" (the fixed list being matched against, e.g. headings, id = its printed label).
- Find the answer key — it is commonly a separate section near the end headed ANSWER KEY, ANSWERS, KEY, or ANSWER SHEET, mapping question numbers to correct answers across the WHOLE test (all passages/sections combined, e.g. 1-40). Extract every number -> answer pair you can find, exactly as printed. If genuinely no answer key exists anywhere in the text, return an empty answers array — do not fabricate answers from guessing at the question content.
- This is for internal teacher review only, not for a student to see — extract everything as accurately as possible, including the answer key, so the teacher can verify it quickly rather than re-typing it by hand.`;

export function buildPdfTestExtractionPrompt(params: {
  testType: "READING" | "LISTENING";
  pdfText: string;
  detectedMarkers?: string[];
}): { system: string; user: string } {
  const lines: string[] = [];
  lines.push(`This is a ${params.testType === "READING" ? "Reading" : "Listening"} IELTS test PDF, extracted to plain text below.`);

  if (params.detectedMarkers && params.detectedMarkers.length >= 2) {
    const noun = params.testType === "READING" ? "passages" : "sections";
    const list = params.detectedMarkers.map((label, i) => `${i + 1}) "${label}"`).join(", ");
    lines.push(
      `A deterministic scan of this exact document already found ${params.detectedMarkers.length} separate ${noun} headers, in this order: ${list}. ` +
        `You MUST return exactly ${params.detectedMarkers.length} entries in the "passages" array, one per header listed above, in the same order — never fewer, never merged. ` +
        `Split the text at each header boundary and assign every question group to the one passage it actually falls under.`
    );
  }

  lines.push(`Raw PDF text:\n"""\n${params.pdfText}\n"""`);
  lines.push("Extract its full structure now using only the text above.");
  return { system: SYSTEM_PROMPT, user: lines.join("\n\n") };
}
