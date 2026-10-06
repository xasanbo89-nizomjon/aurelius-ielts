import type { QuestionType } from "@prisma/client";

import { numberQuestions, summaryBlankKeys } from "@/lib/exam/question-numbering";
import { answerKeysOf } from "@/lib/exam/summary-blanks";
import { insertSummaryBlankMarkers } from "@/lib/exam/pdf-import-conversion";
import type { ValidateTestInput, ValidatorPart } from "@/lib/exam/test-validation";

/**
 * Phase L2 - the model the structured test editor works on, and its two-way conversion to the stored rows (Passage / QuestionGroup / Question).
 *
 * The teacher edits PARTS, each holding GROUPS of one task type (the way a printed paper does: "Questions 1-5 ... Questions 6-9 ..."), each holding
 * ITEMS. Question numbers are never typed: they are worked out from the order of the parts, groups and items by the SAME `numberQuestions` the student's
 * screen uses, over the rows a save would store - so what the editor shows is what the student sees, and a group's range and its "Questions x-y" title
 * are derived from its rows, never typed. Pure and client-safe - no database here.
 */

export type GroupKind =
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE_NOT_GIVEN"
  | "YES_NO_NOT_GIVEN"
  | "MATCHING_HEADINGS"
  | "MATCHING"
  | "SUMMARY_COMPLETION"
  | "NOTE_COMPLETION"
  | "TABLE_COMPLETION"
  | "FORM_COMPLETION"
  | "SENTENCE_COMPLETION"
  | "SHORT_ANSWER"
  | "DIAGRAM_LABELLING";

export type Skill = "READING" | "LISTENING";

type KindMeta = {
  label: string;
  hint: string;
  /** What it is stored as: the task types the scoring engine and the student's screen already know. */
  stored: QuestionType;
  /** One stored row per question (true) or ONE row for the whole group (matching and summary-like tasks). */
  perNumber: boolean;
  instruction: Record<Skill, string>;
};

const LIMIT_TWO = "NO MORE THAN TWO WORDS";

export const GROUP_KIND_META: Record<GroupKind, KindMeta> = {
  MULTIPLE_CHOICE: {
    label: "Multiple choice",
    hint: "Choose one answer - or allow several for a \"choose TWO\" question (it still counts as one numbered question).",
    stored: "MULTIPLE_CHOICE",
    perNumber: true,
    instruction: { READING: "Choose the correct letter, A, B, C or D.", LISTENING: "Choose the correct letter, A, B or C." },
  },
  TRUE_FALSE_NOT_GIVEN: {
    label: "True / False / Not Given",
    hint: "Each statement is TRUE, FALSE or NOT GIVEN.",
    stored: "TRUE_FALSE_NOT_GIVEN",
    perNumber: true,
    instruction: {
      READING: "Do the following statements agree with the information given in the passage? Write TRUE if the statement agrees with the information, FALSE if the statement contradicts the information, NOT GIVEN if there is no information on this.",
      LISTENING: "Do the following statements agree with the information given in the recording? Write TRUE, FALSE or NOT GIVEN.",
    },
  },
  YES_NO_NOT_GIVEN: {
    label: "Yes / No / Not Given",
    hint: "Each statement is YES, NO or NOT GIVEN (the writer's views). The instructions must say YES, NO and NOT GIVEN: that is what makes the student's buttons read Yes / No.",
    stored: "TRUE_FALSE_NOT_GIVEN",
    perNumber: true,
    instruction: {
      READING: "Do the following statements agree with the views of the writer in the passage? Write YES if the statement agrees with the views of the writer, NO if the statement contradicts the views of the writer, NOT GIVEN if it is impossible to say what the writer thinks about this.",
      LISTENING: "Do the following statements agree with the views of the speaker? Write YES, NO or NOT GIVEN.",
    },
  },
  MATCHING_HEADINGS: {
    label: "Matching headings",
    hint: "A list of headings; each paragraph gets one.",
    stored: "MATCHING",
    perNumber: false,
    instruction: { READING: "The passage has paragraphs. Choose the correct heading for each paragraph from the list of headings below. Write the correct number, i-x, next to each paragraph.", LISTENING: "Choose the correct heading for each part from the list of headings below." },
  },
  MATCHING: {
    label: "Matching (information, features, endings)",
    hint: "Match each item to one of the lettered options.",
    stored: "MATCHING",
    perNumber: false,
    instruction: { READING: "Match each statement with the correct option, A-E. You may use any letter more than once.", LISTENING: "Match each item with the correct option, A-E." },
  },
  SUMMARY_COMPLETION: {
    label: "Summary completion",
    hint: "A connected summary with blanks. Optional word list.",
    stored: "SUMMARY_COMPLETION",
    perNumber: false,
    instruction: { READING: `Complete the summary below. Choose ${LIMIT_TWO} from the passage for each answer.`, LISTENING: `Complete the summary below. Write ${LIMIT_TWO} AND/OR A NUMBER for each answer.` },
  },
  NOTE_COMPLETION: {
    label: "Note completion",
    hint: "Notes with blanks.",
    stored: "SUMMARY_COMPLETION",
    perNumber: false,
    instruction: { READING: "Complete the notes below. Write ONE WORD ONLY from the passage for each answer.", LISTENING: "Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer." },
  },
  TABLE_COMPLETION: {
    label: "Table completion",
    hint: "Table rows as text (cells separated by |) with blanks.",
    stored: "SUMMARY_COMPLETION",
    perNumber: false,
    instruction: { READING: `Complete the table below. Choose ${LIMIT_TWO} from the passage for each answer.`, LISTENING: `Complete the table below. Write ${LIMIT_TWO} AND/OR A NUMBER for each answer.` },
  },
  FORM_COMPLETION: {
    label: "Form completion",
    hint: "One line per blank, e.g. \"Name: ......\".",
    stored: "FILL_IN_BLANK",
    perNumber: true,
    instruction: { READING: `Complete the form below. Write ${LIMIT_TWO} for each answer.`, LISTENING: `Complete the form below. Write ${LIMIT_TWO} AND/OR A NUMBER for each answer.` },
  },
  SENTENCE_COMPLETION: {
    label: "Sentence completion",
    hint: "Complete each sentence.",
    stored: "SENTENCE_COMPLETION",
    perNumber: true,
    instruction: { READING: `Complete the sentences below. Choose ${LIMIT_TWO} from the passage for each answer.`, LISTENING: `Complete the sentences below. Write ${LIMIT_TWO} AND/OR A NUMBER for each answer.` },
  },
  SHORT_ANSWER: {
    label: "Short answer",
    hint: "Answer each question in a few words.",
    stored: "SHORT_ANSWER",
    perNumber: true,
    instruction: { READING: "Answer the questions below. Choose NO MORE THAN THREE WORDS from the passage for each answer.", LISTENING: "Answer the questions below. Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer." },
  },
  DIAGRAM_LABELLING: {
    label: "Map / plan / diagram labelling",
    hint: "Add the picture to the part (Pictures), then match each label to a letter.",
    stored: "MATCHING",
    perNumber: false,
    instruction: { READING: "Label the diagram below. Write the correct letter, A-H, next to each label.", LISTENING: "Label the map below. Write the correct letter, A-H, next to each place." },
  },
};

export const GROUP_KIND_ORDER: GroupKind[] = [
  "MULTIPLE_CHOICE",
  "TRUE_FALSE_NOT_GIVEN",
  "YES_NO_NOT_GIVEN",
  "MATCHING_HEADINGS",
  "MATCHING",
  "SUMMARY_COMPLETION",
  "NOTE_COMPLETION",
  "TABLE_COMPLETION",
  "FORM_COMPLETION",
  "SENTENCE_COMPLETION",
  "SHORT_ANSWER",
  "DIAGRAM_LABELLING",
];

export type BuilderChoice = { id: string; text: string };

export type BuilderItem = {
  key: string;
  /** The stored Question row this item came from (kept so everything attached to it stays attached). */
  questionId?: string;
  /** The statement / sentence / question (a gap-fill line keeps its dots: "The museum opens at ......"). */
  prompt: string;
  /** Multiple choice only. */
  choices: BuilderChoice[];
  correctChoiceIds: string[];
  /** True / False / Not Given: "TRUE" | "FALSE" | "NOT_GIVEN" | "" (not chosen yet). */
  tfng: string;
  /** Typed answers: every accepted alternative; empty = no answer yet. */
  answers: string[];
};

export type BuilderGroup = {
  key: string;
  groupId?: string;
  /** The single stored row of a group that is stored as one row (matching, summary, notes, table, diagram). */
  questionId?: string;
  kind: GroupKind;
  instructions: string;
  maxWords: number | null;
  wordBank: string[];
  /** Multiple choice: more than one correct answer ("choose TWO"). */
  allowMultiple: boolean;
  items: BuilderItem[];
  /** Summary / notes / table text, every blank written as {{}} (the real question numbers are written in when it is saved). */
  text: string;
  /** The accepted answers of each blank, in the order the blanks appear in the text. */
  blanks: string[][];
  prompts: BuilderChoice[];
  options: BuilderChoice[];
  matchAnswers: Record<string, string>;
};

export type BuilderPart = {
  key: string;
  passageId?: string;
  title: string;
  /** Reading: the passage as paragraphs separated by a blank line (the student's screen letters them A, B, C ...). Listening: the optional transcript. */
  content: string;
  /** Listening, one recording shared by every part: where this part starts inside it, in seconds (Part 1 is always 0 / empty). */
  startSeconds: number | null;
  groups: BuilderGroup[];
};

export type BuilderModel = {
  title: string;
  description: string;
  durationMinutes: number | null;
  category: "GENERAL" | "CAMBRIDGE";
  parts: BuilderPart[];
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------------------------------------------

let counter = 0;
/** A short key for things that only exist in the editor. */
export const newKey = (prefix = "k") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];

/** The label of the n-th option: letters for most tasks, small roman numerals for a list of headings. */
export const optionLabel = (kind: GroupKind, index: number): string => (kind === "MATCHING_HEADINGS" ? (ROMAN[index] ?? String(index + 1)) : (LETTERS[index] ?? String(index + 1)));

/**
 * What the teacher types as one answer -> the accepted alternatives. "colour / color" and "colour | color" are two answers; words in brackets are
 * optional: "(the) library" accepts "library" and "the library". Case and extra spaces never matter (the scoring ignores them).
 */
export function expandAlternatives(input: string): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    const clean = value.replace(/\s+/g, " ").trim();
    if (clean && !out.some((existing) => existing.toLowerCase() === clean.toLowerCase())) out.push(clean);
  };
  for (const part of input.split(/\s*[/|]\s*|\n/)) {
    const optional = [...part.matchAll(/\(([^)]*)\)/g)];
    if (optional.length === 0 || optional.length > 4) {
      push(part.replace(/[()]/g, ""));
      continue;
    }
    // every combination of the bracketed words being there or not
    for (let mask = 0; mask < 1 << optional.length; mask++) {
      let result = part;
      optional.forEach((match, index) => {
        result = result.replace(match[0], mask & (1 << index) ? match[1] : "");
      });
      push(result);
    }
  }
  return out;
}

/** The alternatives written back the way a teacher types them: "colour / color". */
export const alternativesText = (answers: readonly string[]): string => answers.join(" / ");

/** A text answer as stored: one string for one answer, an array for alternatives. */
export function storedTextAnswer(answers: readonly string[]): string | string[] {
  const clean = answers.map((a) => a.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  return clean.length === 1 ? clean[0] : clean;
}

const asRecord = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const asChoices = (value: unknown): BuilderChoice[] =>
  Array.isArray(value) ? value.flatMap((v) => (asRecord(v) && typeof asRecord(v)!.id === "string" ? [{ id: String(asRecord(v)!.id), text: typeof asRecord(v)!.text === "string" ? (asRecord(v)!.text as string) : "" }] : [])) : [];
const asAnswerList = (value: unknown): string[] => (typeof value === "string" ? (value.trim() ? [value.trim()] : []) : Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()) : []);

export function emptyItem(kind: GroupKind): BuilderItem {
  return {
    key: newKey("i"),
    prompt: "",
    choices: kind === "MULTIPLE_CHOICE" ? ["A", "B", "C", "D"].map((id) => ({ id, text: "" })) : [],
    correctChoiceIds: [],
    tfng: "",
    answers: [],
  };
}

export function emptyGroup(kind: GroupKind, skill: Skill): BuilderGroup {
  const perNumber = GROUP_KIND_META[kind].perNumber;
  const matching = GROUP_KIND_META[kind].stored === "MATCHING";
  return {
    key: newKey("g"),
    kind,
    instructions: GROUP_KIND_META[kind].instruction[skill],
    maxWords: null,
    wordBank: [],
    allowMultiple: false,
    items: perNumber ? [emptyItem(kind)] : [],
    text: "",
    blanks: [],
    prompts: matching ? [{ id: "p1", text: "" }] : [],
    options: matching ? [0, 1, 2].map((i) => ({ id: optionLabel(kind, i), text: "" })) : [],
    matchAnswers: {},
  };
}

export function emptyPart(index: number, skill: Skill): BuilderPart {
  return { key: newKey("p"), title: skill === "LISTENING" ? `Part ${index + 1}` : `Passage ${index + 1}`, content: "", startSeconds: null, groups: [] };
}

/** Moves the element at `index` one place up or down (no-op at the ends). Used for groups and for items: the order in the editor IS the student's order. */
export function moveWithin<T>(list: T[], index: number, direction: "up" | "down"): void {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Blanks inside a summary / notes / table text
// ---------------------------------------------------------------------------------------------------------------------------------------------------

const BLANK_TOKEN = /\{\{[^{}]*\}\}/g;

/** How many blanks a text has (every {{...}} counts). */
export const countBlanks = (text: string): number => (text.match(BLANK_TOKEN) ?? []).length;

/** Writes the real question numbers into the blank markers, in order: {{}} {{}} -> {{14}} {{15}}. */
export function numberBlanks(text: string, firstNumber: number): string {
  let next = firstNumber;
  return text.replace(BLANK_TOKEN, () => `{{${next++}}}`);
}

/** Every blank back to the plain {{}} the editor shows (the numbers are worked out live). */
export const unnumberBlanks = (text: string): string => text.replace(BLANK_TOKEN, "{{}}");

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type PassageRow = { id: string; title: string; content: string; orderIndex: number; audioStartSeconds: number | null };
export type GroupRow = { id: string; passageId: string; title: string; startQuestion: number; endQuestion: number; instructions: string | null; orderIndex: number };
export type QuestionRow = {
  id: string;
  passageId: string;
  questionGroupId: string;
  type: QuestionType;
  prompt: string;
  options: unknown;
  correctAnswer: unknown;
  points: number;
  orderIndex: number;
};

export type BuilderRows = { passages: PassageRow[]; groups: GroupRow[]; questions: QuestionRow[]; total: number };

/** Makes the id of a row that has none yet; `key` is the editor key of the part / group / item it is for. */
export type IdFactory = (key: string) => string;

/** The key an editor element is known by when it has no stored id yet. A group that is stored as ONE row keeps that row under `<group key>:row`. */
export const rowKeyOfGroup = (group: BuilderGroup) => `${group.key}:row`;

/** "Questions 14-18": the title every group is saved with (the same wording `syncGroupRanges` writes). */
export const groupTitle = (first: number, last: number) => `Questions ${first}-${last}`;

/**
 * The model -> the rows to store. Existing ids are kept (so everything attached to a row stays attached); `newId` makes ids for new rows. The rows are
 * built, numbered with the student's own `numberQuestions`, and only THEN do the blanks of each summary get their real numbers and each group its
 * range - so no number in the result comes from the editor's own arithmetic.
 */
export function toRows(model: BuilderModel, newId: IdFactory): BuilderRows {
  const passages: PassageRow[] = [];
  const groups: GroupRow[] = [];
  const questions: QuestionRow[] = [];
  const summaryRows = new Map<string, BuilderGroup>(); // row id -> its group
  let order = 0;

  model.parts.forEach((part, partIndex) => {
    const passageId = part.passageId ?? newId(part.key);
    passages.push({ id: passageId, title: part.title.trim() || `Part ${partIndex + 1}`, content: part.content, orderIndex: partIndex, audioStartSeconds: partIndex === 0 ? null : part.startSeconds });

    part.groups.forEach((group, groupIndex) => {
      const meta = GROUP_KIND_META[group.kind];
      const groupId = group.groupId ?? newId(group.key);
      groups.push({ id: groupId, passageId, title: "", startQuestion: 0, endQuestion: 0, instructions: group.instructions.trim() || null, orderIndex: groupIndex });
      const push = (row: Omit<QuestionRow, "passageId" | "questionGroupId" | "orderIndex">) => questions.push({ ...row, passageId, questionGroupId: groupId, orderIndex: order++ });

      if (meta.perNumber) {
        for (const item of group.items) {
          const id = item.questionId ?? newId(item.key);
          if (group.kind === "MULTIPLE_CHOICE") {
            const choices = item.choices.map((choice) => ({ id: choice.id, text: choice.text }));
            const known = new Set(choices.map((choice) => choice.id));
            push({ id, type: "MULTIPLE_CHOICE", prompt: item.prompt, options: { choices, allowMultiple: group.allowMultiple }, correctAnswer: item.correctChoiceIds.filter((c) => known.has(c)), points: 1 });
          } else if (meta.stored === "TRUE_FALSE_NOT_GIVEN") {
            push({ id, type: "TRUE_FALSE_NOT_GIVEN", prompt: item.prompt, options: {}, correctAnswer: item.tfng || null, points: 1 });
          } else {
            const options: Record<string, unknown> = {};
            if (group.maxWords) options.maxWords = group.maxWords;
            if (group.wordBank.length > 0) options.wordBank = group.wordBank;
            push({ id, type: meta.stored, prompt: item.prompt, options, correctAnswer: storedTextAnswer(item.answers), points: 1 });
          }
        }
      } else if (meta.stored === "MATCHING") {
        const id = group.questionId ?? newId(rowKeyOfGroup(group));
        const prompts = group.prompts.map((prompt) => ({ id: prompt.id, text: prompt.text }));
        const known = new Set(group.options.map((option) => option.id));
        const answers: Record<string, string> = {};
        for (const prompt of prompts) if (group.matchAnswers[prompt.id] && known.has(group.matchAnswers[prompt.id])) answers[prompt.id] = group.matchAnswers[prompt.id];
        push({ id, type: "MATCHING", prompt: group.instructions, options: { prompts, options: group.options.map((option) => ({ id: option.id, text: option.text })) }, correctAnswer: answers, points: Math.min(20, Math.max(1, prompts.length)) });
      } else {
        // summary / notes / table: one row. The blanks stay {{}} for now; they are numbered below, once the row's first number is known.
        const id = group.questionId ?? newId(rowKeyOfGroup(group));
        const blanks = Math.max(1, countBlanks(group.text));
        const options: Record<string, unknown> = { text: group.text, blankCount: blanks };
        if (group.wordBank.length > 0) options.wordBank = group.wordBank;
        if (group.maxWords) options.maxWords = group.maxWords;
        push({ id, type: "SUMMARY_COMPLETION", prompt: group.instructions, options, correctAnswer: {}, points: Math.min(20, blanks) });
        summaryRows.set(id, group);
      }
    });
  });

  // Pass 1 - the numbers, from the student's own function (a summary row spans its declared blankCount).
  const first = numberQuestions(questions.map((q) => ({ id: q.id, type: q.type, options: q.options })));
  // Pass 2 - write the real numbers into each summary's blanks and answer keys.
  first.forEach((row, index) => {
    const group = summaryRows.get(row.id);
    if (!group) return;
    const text = numberBlanks(group.text, row.startNumber);
    const answers: Record<string, string | string[]> = {};
    summaryBlankKeys(text).forEach((key, i) => {
      answers[key] = storedTextAnswer(group.blanks[i] ?? []);
    });
    questions[index] = { ...questions[index], options: { ...(questions[index].options as Record<string, unknown>), text }, correctAnswer: answers };
  });

  // Final numbering, over the finished rows: every group's range and title, and the total.
  const numbered = numberQuestions(questions.map((q) => ({ id: q.id, groupId: q.questionGroupId, type: q.type, options: q.options, blankKeys: q.type === "SUMMARY_COMPLETION" ? answerKeysOf(q.correctAnswer) : null })));
  for (const group of groups) {
    const rows = numbered.filter((row) => row.groupId === group.id);
    if (rows.length === 0) {
      group.startQuestion = 0;
      group.endQuestion = 0;
      group.title = "Questions";
      continue;
    }
    group.startQuestion = rows[0].startNumber;
    group.endQuestion = rows[rows.length - 1].endNumber;
    group.title = groupTitle(group.startQuestion, group.endQuestion);
  }
  return { passages, groups, questions, total: numbered.length > 0 ? numbered[numbered.length - 1].endNumber : 0 };
}

type StoredQuestion = { id: string; passageId: string | null; questionGroupId: string | null; type: QuestionType; prompt: string; options: unknown; correctAnswer: unknown; orderIndex: number };
type StoredGroup = { id: string; passageId: string; instructions: string | null; orderIndex: number };
type StoredPassage = { id: string; title: string; content: string; orderIndex: number; audioStartSeconds: number | null };

function kindOf(type: QuestionType, instructions: string): GroupKind {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return "MULTIPLE_CHOICE";
    case "TRUE_FALSE_NOT_GIVEN":
      return /\byes\b/i.test(instructions) && /\bno\b/i.test(instructions) && /not\s+given/i.test(instructions) ? "YES_NO_NOT_GIVEN" : "TRUE_FALSE_NOT_GIVEN";
    case "MATCHING":
      return /heading/i.test(instructions) ? "MATCHING_HEADINGS" : /\b(diagram|map|plan|label)/i.test(instructions) ? "DIAGRAM_LABELLING" : "MATCHING";
    case "SUMMARY_COMPLETION":
      return /\btable\b/i.test(instructions) ? "TABLE_COMPLETION" : /\bnotes?\b/i.test(instructions) ? "NOTE_COMPLETION" : "SUMMARY_COMPLETION";
    case "FILL_IN_BLANK":
      return "FORM_COMPLETION";
    case "SENTENCE_COMPLETION":
      return "SENTENCE_COMPLETION";
    default:
      return "SHORT_ANSWER";
  }
}

function itemFromRow(row: StoredQuestion): BuilderItem {
  const options = asRecord(row.options) ?? {};
  const item: BuilderItem = { key: newKey("i"), questionId: row.id, prompt: row.prompt, choices: [], correctChoiceIds: [], tfng: "", answers: [] };
  if (row.type === "MULTIPLE_CHOICE") {
    item.choices = asChoices(options.choices);
    item.correctChoiceIds = Array.isArray(row.correctAnswer) ? (row.correctAnswer as unknown[]).filter((v): v is string => typeof v === "string") : [];
  } else if (row.type === "TRUE_FALSE_NOT_GIVEN") {
    item.tfng = typeof row.correctAnswer === "string" ? row.correctAnswer : "";
  } else {
    item.answers = asAnswerList(row.correctAnswer);
  }
  return item;
}

/**
 * A summary row's text and answers in the editor's form: every blank is a plain {{}}, the answers lined up with the blanks in the order they appear.
 * A row saved before the {{n}} convention writes its blanks the way the PDF printed them ("37 ......"): they are recognised by the numbers of the
 * answer key, so opening the test in the editor (and saving) converts them.
 */
function summaryFromRow(row: StoredQuestion): { text: string; blanks: string[][] } {
  const options = asRecord(row.options) ?? {};
  const answers = asRecord(row.correctAnswer) ?? {};
  let text = typeof options.text === "string" ? options.text : "";
  if (summaryBlankKeys(text).length === 0) {
    for (const key of answerKeysOf(row.correctAnswer)) if (/^\d+$/.test(key)) text = insertSummaryBlankMarkers(text, Number(key), Number(key));
  }
  const keys = summaryBlankKeys(text);
  return { text: unnumberBlanks(text), blanks: keys.map((key) => asAnswerList(answers[key])) };
}

/**
 * The stored rows -> the model. Rows are grouped by their QuestionGroup in test order; a legacy row with no group becomes a group of its own
 * (consecutive rows of the same type are gathered), a group that mixes task types is split into one group per run of the same type, and a row that
 * sits in no passage at all is kept at the end of the first part - nothing stored is dropped just by opening the editor.
 */
export function fromRows(args: {
  title: string;
  description: string | null;
  durationMinutes: number | null;
  category: "GENERAL" | "CAMBRIDGE";
  passages: StoredPassage[];
  groups: StoredGroup[];
  questions: StoredQuestion[];
}): BuilderModel {
  const groupInfo = new Map(args.groups.map((group) => [group.id, group]));
  const sortedPassages = [...args.passages].sort((a, b) => a.orderIndex - b.orderIndex);
  const passageIds = new Set(sortedPassages.map((p) => p.id));
  const orphans = args.questions.filter((q) => !q.passageId || !passageIds.has(q.passageId));

  const parts: BuilderPart[] = sortedPassages.map((passage, passageIndex) => {
    const rows = [...args.questions.filter((q) => q.passageId === passage.id), ...(passageIndex === 0 ? orphans : [])].sort((a, b) => a.orderIndex - b.orderIndex);
    const built: BuilderGroup[] = [];
    let current: { groupId: string | null; rows: StoredQuestion[] } | null = null;
    const usedGroupIds = new Set<string>();

    const flush = () => {
      if (!current || current.rows.length === 0) return;
      const first = current.rows[0];
      const stored = current.groupId ? groupInfo.get(current.groupId) : undefined;
      const instructions = stored?.instructions ?? (first.type === "MATCHING" || first.type === "SUMMARY_COMPLETION" ? first.prompt : "");
      const kind = kindOf(first.type, instructions);
      const group: BuilderGroup = { ...emptyGroup(kind, "READING"), key: newKey("g"), kind, instructions, items: [] };
      // a stored group id is only handed to the FIRST builder group made from it (a split group's later parts get new ids)
      if (current.groupId && !usedGroupIds.has(current.groupId)) {
        group.groupId = current.groupId;
        usedGroupIds.add(current.groupId);
      }
      const options = asRecord(first.options) ?? {};
      if (GROUP_KIND_META[kind].perNumber) {
        group.items = current.rows.map(itemFromRow);
        group.allowMultiple = options.allowMultiple === true;
        group.maxWords = typeof options.maxWords === "number" ? options.maxWords : null;
        group.wordBank = Array.isArray(options.wordBank) ? (options.wordBank as unknown[]).filter((w): w is string => typeof w === "string") : [];
      } else if (first.type === "MATCHING") {
        group.questionId = first.id;
        group.prompts = asChoices(options.prompts);
        group.options = asChoices(options.options);
        const answers = asRecord(first.correctAnswer) ?? {};
        group.matchAnswers = Object.fromEntries(Object.entries(answers).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      } else {
        group.questionId = first.id;
        const summary = summaryFromRow(first);
        group.text = summary.text;
        group.blanks = summary.blanks;
        group.maxWords = typeof options.maxWords === "number" ? options.maxWords : null;
        group.wordBank = Array.isArray(options.wordBank) ? (options.wordBank as unknown[]).filter((w): w is string => typeof w === "string") : [];
      }
      built.push(group);
      current = null;
    };

    for (const row of rows) {
      const oneRowKind = row.type === "MATCHING" || row.type === "SUMMARY_COMPLETION"; // these are a whole group in one row
      const sameGroup = current !== null && !oneRowKind && current.rows[0].type === row.type && ((row.questionGroupId !== null && row.questionGroupId === current.groupId) || (row.questionGroupId === null && current.groupId === null));
      if (sameGroup) {
        current!.rows.push(row);
        continue;
      }
      flush();
      current = { groupId: row.questionGroupId, rows: [row] };
    }
    flush();
    return { key: newKey("p"), passageId: passage.id, title: passage.title, content: passage.content, startSeconds: passageIndex === 0 ? null : passage.audioStartSeconds, groups: built };
  });

  return { title: args.title, description: args.description ?? "", durationMinutes: args.durationMinutes, category: args.category, parts };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Numbers the editor shows
// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type GroupLayout = { first: number; last: number; count: number; itemNumbers: number[] };
export type ModelLayout = { total: number; parts: { first: number | null; last: number | null; count: number; groups: GroupLayout[] }[] };

/**
 * The question numbers of every part / group / item - read off the SAME numbering the student gets: the rows a save would store, numbered by
 * `numberQuestions`. (Rows not saved yet use their editor key as their id.)
 */
export function layoutOf(model: BuilderModel): ModelLayout {
  const rows = toRows(model, (key) => key);
  const numbered = numberQuestions(rows.questions.map((q) => ({ id: q.id, groupId: q.questionGroupId, type: q.type, options: q.options, blankKeys: q.type === "SUMMARY_COMPLETION" ? answerKeysOf(q.correctAnswer) : null })));
  const byId = new Map(numbered.map((row) => [row.id, row]));
  const range = (ids: string[]) => ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? Array.from({ length: row.span }, (_, i) => row.startNumber + i) : [];
  });

  const parts = model.parts.map((part) => {
    const groups = part.groups.map((group): GroupLayout => {
      const meta = GROUP_KIND_META[group.kind];
      const ids = meta.perNumber ? group.items.map((item) => item.questionId ?? item.key) : [group.questionId ?? rowKeyOfGroup(group)];
      const itemNumbers = range(ids);
      const first = itemNumbers[0] ?? 0;
      return { first, last: itemNumbers.length ? itemNumbers[itemNumbers.length - 1] : 0, count: itemNumbers.length, itemNumbers };
    });
    const all = groups.filter((g) => g.count > 0);
    const count = all.reduce((sum, g) => sum + g.count, 0);
    return { first: count > 0 ? all[0].first : null, last: count > 0 ? all[all.length - 1].last : null, count, groups };
  });
  return { total: rows.total, parts };
}

/** The model as the validator reads it: the same rows a save would store, with the parts' recording facts. */
export function toValidatorInput(model: BuilderModel, skill: Skill, audio: Map<string, { src: string | null; durationSeconds: number | null }>): ValidateTestInput {
  // Rows that were never saved use their editor key as their id, so a problem found here points at the element the editor drew for it.
  const rows = toRows(model, (key) => key);
  const parts: ValidatorPart[] = model.parts.map((part, index) => {
    const id = part.passageId ?? rows.passages[index].id;
    const info = audio.get(id) ?? audio.get(part.key);
    return { id, title: part.title, content: part.content, audioSrc: info?.src ?? null, audioDurationSeconds: info?.durationSeconds ?? null, startSeconds: index === 0 ? null : part.startSeconds };
  });
  return {
    type: skill,
    title: model.title,
    parts,
    groups: rows.groups.map((group) => ({ id: group.id, partId: group.passageId, instructions: group.instructions, startQuestion: group.startQuestion, endQuestion: group.endQuestion })),
    questions: rows.questions.map((q) => ({ id: q.id, partId: q.passageId, groupId: q.questionGroupId, type: q.type, prompt: q.prompt, options: q.options, correctAnswer: q.correctAnswer, order: q.orderIndex })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The student's view of a group
// ---------------------------------------------------------------------------------------------------------------------------------------------------

/** A row as the student's question renderer takes it (the shape of a numbered ExamQuestion). */
export type PreviewRow = {
  id: string;
  passageId: string | null;
  groupId: string | null;
  type: QuestionType;
  prompt: string;
  options: unknown;
  orderIndex: number;
  blankKeys: string[] | null;
  startNumber: number;
  endNumber: number;
  span: number;
  slotKeys: (string | null)[];
};

export type PreviewGroupInfo = { id: string; passageId: string; startQuestion: number; endQuestion: number; title: string; instructions: string | null; orderIndex: number };

/**
 * For every group (by its editor key): the numbered rows and the group info exactly as the student's screen would be given them after a save, so the
 * editor can draw the REAL question renderer ("Preview as the student sees it") with the real numbers.
 */
export function previewOf(model: BuilderModel): Map<string, { rows: PreviewRow[]; info: PreviewGroupInfo }> {
  const rows = toRows(model, (key) => key);
  const numbered = numberQuestions(
    rows.questions.map((q) => ({ id: q.id, passageId: q.passageId, groupId: q.questionGroupId, type: q.type, prompt: q.prompt, options: q.options, orderIndex: q.orderIndex, blankKeys: q.type === "SUMMARY_COMPLETION" ? answerKeysOf(q.correctAnswer) : null }))
  );
  const result = new Map<string, { rows: PreviewRow[]; info: PreviewGroupInfo }>();
  for (const part of model.parts) {
    for (const group of part.groups) {
      const id = group.groupId ?? group.key;
      const stored = rows.groups.find((g) => g.id === id);
      if (!stored) continue;
      result.set(group.key, { rows: numbered.filter((row) => row.groupId === id), info: { id, passageId: stored.passageId, startQuestion: stored.startQuestion, endQuestion: stored.endQuestion, title: stored.title, instructions: stored.instructions, orderIndex: stored.orderIndex } });
    }
  }
  return result;
}
