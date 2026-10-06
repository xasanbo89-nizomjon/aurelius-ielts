import type { QuestionType } from "@prisma/client";

import { numberQuestions, summaryBlankKeys, type NumberedQuestion } from "@/lib/exam/question-numbering";
import { answerKeysOf, parseSummaryText } from "@/lib/exam/summary-blanks";

/**
 * Phase L - the one definition of "this Reading / Listening test is ready for students". Pure and client-safe: the editor's checklist runs it on
 * the test being edited (so the teacher sees problems while typing), and the publish action runs it again on the stored rows before it lets a test go
 * live. Every problem names where it is, so the editor can link to the exact field.
 */

export const REQUIRED_QUESTIONS = 40;
export const READING_PART_COUNT = 3;
export const LISTENING_PART_COUNT = 4;

export type ValidatorPart = {
  id: string;
  title: string;
  /** Reading: the passage text. Listening: the optional transcript. */
  content: string;
  /** The servable recording of this part (an own file, or the one shared by every part); null = none. */
  audioSrc: string | null;
  /** The measured length of that recording in whole seconds; null = not measured (or not readable). */
  audioDurationSeconds: number | null;
  /** Phase L2 - Listening, one recording shared by every part: where this part starts inside it, in seconds. Part 1 has none (it starts at 0). */
  startSeconds?: number | null;
};

/** "7:05" -> 425, "1:02:03" -> 3723, "425" -> 425; empty -> null; anything else -> NaN (a time the teacher typed wrongly). */
export function parseTimeInput(text: string): number | null {
  const clean = text.trim();
  if (!clean) return null;
  if (!/^\d{1,3}(:[0-5]?\d){0,2}$/.test(clean)) return Number.NaN;
  const parts = clean.split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** 425 -> "7:05", 3723 -> "1:02:03", null -> "". */
export function formatTimeInput(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const sec = whole % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export type ValidatorGroup = { id: string; partId: string; instructions: string | null; startQuestion: number; endQuestion: number };

export type ValidatorQuestion = {
  id: string;
  partId: string | null;
  groupId: string | null;
  type: QuestionType;
  prompt: string;
  options: unknown;
  correctAnswer: unknown;
  /** Position in the test (ascending). */
  order: number;
};

export type IssueTarget = { kind: "test" | "part" | "group" | "question" | "audio" | "times"; partId?: string; groupId?: string; questionId?: string };

export type IssueSeverity = "error" | "warning";

export type TestIssue = {
  code:
    | "TITLE"
    | "PART_COUNT"
    | "PART_TEXT"
    | "PART_AUDIO"
    | "PART_QUESTIONS"
    | "TOTAL"
    | "ORDER"
    | "GROUP_INSTRUCTIONS"
    | "GROUP_RANGE"
    | "QUESTION_TEXT"
    | "ANSWER_MISSING"
    | "ANSWER_INVALID"
    | "OPTIONS"
    | "SUMMARY_BLANKS"
    | "AUDIO_DURATION"
    | "AUDIO_START_TIMES"
    | "PARITY";
  severity: IssueSeverity;
  message: string;
  target: IssueTarget;
};

export type PartSummary = { partId: string; title: string; first: number | null; last: number | null; count: number };

export type TestValidation = {
  ok: boolean;
  issues: TestIssue[];
  total: number;
  parts: PartSummary[];
};

const asRecord = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const choicesOf = (value: unknown): { id: string; text: string }[] => (Array.isArray(value) ? value.filter((v): v is { id: string; text: string } => asRecord(v) != null && typeof asRecord(v)!.id === "string") : []);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
/** One answer, or a list of accepted alternatives: at least one non-empty piece. */
const hasTextAnswer = (value: unknown): boolean => (typeof value === "string" ? nonEmpty(value) : Array.isArray(value) && value.length > 0 && value.every(nonEmpty));

export const TRUE_FALSE_VALUES = ["TRUE", "FALSE", "NOT_GIVEN"] as const;

type Numbered = NumberedQuestion<ValidatorQuestion & { blankKeys: string[] | null }>;

/** "Question 7" / "Questions 14–18": where a problem sits, in the numbers the student sees. */
export const questionLabel = (row: { startNumber: number; endNumber: number }) => (row.startNumber === row.endNumber ? `Question ${row.startNumber}` : `Questions ${row.startNumber}–${row.endNumber}`);

function checkQuestion(row: Numbered, groupInstructions: string | null): TestIssue[] {
  const label = questionLabel(row);
  const target: IssueTarget = { kind: "question", questionId: row.id, partId: row.partId ?? undefined, groupId: row.groupId ?? undefined };
  const issue = (code: TestIssue["code"], message: string): TestIssue => ({ code, severity: "error", message: `${label}: ${message}`, target });
  const issues: TestIssue[] = [];
  const options = asRecord(row.options) ?? {};

  switch (row.type) {
    case "MULTIPLE_CHOICE": {
      if (!nonEmpty(row.prompt)) issues.push(issue("QUESTION_TEXT", "the question has no text."));
      const choices = choicesOf(options.choices);
      if (choices.length < 2 || choices.some((choice) => !nonEmpty(choice.text))) issues.push(issue("OPTIONS", "needs at least 2 answer choices, each with text."));
      const answer = Array.isArray(row.correctAnswer) ? (row.correctAnswer as unknown[]).filter((v): v is string => typeof v === "string") : [];
      if (answer.length === 0) issues.push(issue("ANSWER_MISSING", "no correct answer is chosen."));
      else if (answer.some((id) => !choices.some((choice) => choice.id === id))) issues.push(issue("ANSWER_INVALID", "the correct answer is not one of the choices."));
      else if (options.allowMultiple !== true && answer.length !== 1) issues.push(issue("ANSWER_INVALID", `a single-answer question has ${answer.length} correct answers.`));
      break;
    }
    case "TRUE_FALSE_NOT_GIVEN": {
      if (!nonEmpty(row.prompt)) issues.push(issue("QUESTION_TEXT", "the statement is empty."));
      const answer = typeof row.correctAnswer === "string" ? row.correctAnswer : "";
      const yesNo = /\byes\b/i.test(groupInstructions ?? "") && /\bno\b/i.test(groupInstructions ?? "");
      if (!answer) issues.push(issue("ANSWER_MISSING", yesNo ? "no answer (Yes / No / Not Given) is chosen." : "no answer (True / False / Not Given) is chosen."));
      else if (!(TRUE_FALSE_VALUES as readonly string[]).includes(answer)) {
        issues.push(issue("ANSWER_INVALID", `"${answer}" is not a valid answer: use ${yesNo ? "Yes, No or Not Given" : "True, False or Not Given"}.`));
      }
      break;
    }
    case "SENTENCE_COMPLETION":
    case "FILL_IN_BLANK":
    case "SHORT_ANSWER": {
      if (!nonEmpty(row.prompt)) issues.push(issue("QUESTION_TEXT", "the question has no text."));
      if (!hasTextAnswer(row.correctAnswer)) issues.push(issue("ANSWER_MISSING", "no answer is entered."));
      break;
    }
    case "MATCHING": {
      const prompts = choicesOf(options.prompts);
      const list = choicesOf(options.options);
      const answers = asRecord(row.correctAnswer) ?? {};
      if (prompts.length === 0) issues.push(issue("OPTIONS", "has nothing to match: add the items (for example the paragraphs)."));
      if (list.length < 2 || list.some((option) => !nonEmpty(option.text))) issues.push(issue("OPTIONS", "needs at least 2 options (for example headings), each with text."));
      else if (/heading/i.test(`${groupInstructions ?? ""} ${row.prompt}`) && list.length < prompts.length) {
        issues.push(issue("OPTIONS", `has ${list.length} headings for ${prompts.length} paragraphs: there must be at least as many headings as paragraphs.`));
      }
      prompts.forEach((prompt, index) => {
        const answer = answers[prompt.id];
        const number = row.startNumber + index;
        if (typeof answer !== "string" || !answer) issues.push({ ...issue("ANSWER_MISSING", ""), message: `Question ${number}: no answer is chosen.` });
        else if (!list.some((option) => option.id === answer)) issues.push({ ...issue("ANSWER_INVALID", ""), message: `Question ${number}: the answer is not one of the options.` });
      });
      break;
    }
    case "SUMMARY_COMPLETION": {
      const text = typeof options.text === "string" ? options.text : "";
      const keys = summaryBlankKeys(text);
      const declared = typeof options.blankCount === "number" ? options.blankCount : 0;
      if (!nonEmpty(text)) issues.push(issue("SUMMARY_BLANKS", "the text is empty."));
      else if (keys.length === 0) {
        // Phase L2 - the old dotted spelling ("37 ......") is still drawn as answer boxes on the student's screen, but {{n}} is the stored form every editor, import and check relies on.
        const dotted = parseSummaryText(text).style === "legacy";
        issues.push(issue("SUMMARY_BLANKS", dotted ? "writes its blanks as dotted lines (for example \"37 ......\") instead of {{n}} blank markers: open the test in the editor and use \"Insert blank\" for each answer box." : "has no blanks: mark each answer box in the text."));
      } else if (keys.length < declared) issues.push(issue("SUMMARY_BLANKS", `the text marks only ${keys.length} of its ${declared} blanks with {{n}}: every blank needs a marker.`));
      else if (keys.length > declared) issues.push(issue("SUMMARY_BLANKS", `the text has ${keys.length} blanks but is set up for ${declared}.`));

      if (keys.length > 0) {
        // The numbers must agree three ways: the markers in the text, the answers, and the numbers this task really has in the test.
        const sameNumbers = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort((x, y) => Number(x) - Number(y)).join(",") === [...b].sort((x, y) => Number(x) - Number(y)).join(",");
        const answerKeys = answerKeysOf(row.correctAnswer);
        const rowNumbers = Array.from({ length: row.endNumber - row.startNumber + 1 }, (_, i) => String(row.startNumber + i));
        if (!sameNumbers(keys, answerKeys)) issues.push(issue("SUMMARY_BLANKS", `the blanks in the text are numbered ${keys.join(", ")} but the answers are for ${answerKeys.join(", ") || "no question"}: they must be the same numbers.`));
        else if (keys.length === declared && !sameNumbers(keys, rowNumbers)) issues.push(issue("SUMMARY_BLANKS", `the blanks are numbered ${keys.join(", ")} but this task is Questions ${row.startNumber}–${row.endNumber}: renumber the blanks (the editor does it for you).`));
      }
      const answers = asRecord(row.correctAnswer) ?? {};
      keys.forEach((key, index) => {
        if (!hasTextAnswer(answers[key])) issues.push({ ...issue("ANSWER_MISSING", ""), message: `Question ${row.startNumber + index}: no answer is entered.` });
      });
      break;
    }
  }
  return issues;
}

export type ValidateTestInput = {
  type: "READING" | "LISTENING";
  title: string;
  parts: ValidatorPart[];
  groups: ValidatorGroup[];
  questions: ValidatorQuestion[];
};

export function validateTestStructure(input: ValidateTestInput): TestValidation {
  const issues: TestIssue[] = [];
  const add = (code: TestIssue["code"], message: string, target: IssueTarget, severity: IssueSeverity = "error") => issues.push({ code, severity, message, target });
  const listening = input.type === "LISTENING";
  const partName = (index: number) => (listening ? `Part ${index + 1}` : `Passage ${index + 1}`);

  if (input.title.trim().length < 3) add("TITLE", "Give the test a title (at least 3 characters).", { kind: "test" });

  const expectedParts = listening ? LISTENING_PART_COUNT : READING_PART_COUNT;
  if (input.parts.length !== expectedParts) {
    add("PART_COUNT", `A ${listening ? "Listening" : "Reading"} test has ${expectedParts} ${listening ? "parts" : "passages"}; this one has ${input.parts.length}.`, { kind: "test" });
  }

  // ---- numbering: the same helper the student's screen uses, over the rows in test order ----------------------------------------------------------
  const sorted = [...input.questions].sort((a, b) => a.order - b.order);
  const numbered = numberQuestions(sorted.map((q) => ({ ...q, blankKeys: q.type === "SUMMARY_COMPLETION" ? answerKeysOf(q.correctAnswer) : null }))) as Numbered[];
  const total = numbered.length > 0 ? numbered[numbered.length - 1].endNumber : 0;
  if (total !== REQUIRED_QUESTIONS) {
    add("TOTAL", `The test has ${total} question${total === 1 ? "" : "s"}; a ${listening ? "Listening" : "Reading"} test must have exactly ${REQUIRED_QUESTIONS}.`, { kind: "test" });
  }

  // ---- parts ------------------------------------------------------------------------------------------------------------------------------------
  const partIndex = new Map(input.parts.map((part, index) => [part.id, index]));
  const parts: PartSummary[] = input.parts.map((part, index) => {
    const rows = numbered.filter((row) => row.partId === part.id);
    const target: IssueTarget = { kind: "part", partId: part.id };
    if (!listening && part.content.trim().length < 50) add("PART_TEXT", `${partName(index)} has no passage text.`, target);
    if (listening && !part.audioSrc) add("PART_AUDIO", `${partName(index)} has no recording.`, { kind: "audio", partId: part.id });
    if (rows.length === 0) add("PART_QUESTIONS", `${partName(index)} has no questions.`, target);
    return { partId: part.id, title: part.title, first: rows.length ? rows[0].startNumber : null, last: rows.length ? rows[rows.length - 1].endNumber : null, count: rows.reduce((sum, row) => sum + row.span, 0) };
  });

  const unplaced = numbered.filter((row) => !row.partId || !partIndex.has(row.partId));
  if (unplaced.length > 0) add("PART_QUESTIONS", `${unplaced.length === 1 ? "A question is" : `${unplaced.length} questions are`} not inside any ${listening ? "part" : "passage"}.`, { kind: "question", questionId: unplaced[0].id });

  // The questions of Part 1 come first, then Part 2, then Part 3: a row of an earlier part after a later one would interleave the numbers.
  let highest = -1;
  for (const row of numbered) {
    const index = row.partId ? partIndex.get(row.partId) : undefined;
    if (index === undefined) continue;
    if (index < highest) {
      add("ORDER", `${questionLabel(row)} belongs to ${partName(index)} but comes after questions of a later ${listening ? "part" : "passage"}; the numbers would not run 1–${REQUIRED_QUESTIONS} through the parts in order.`, { kind: "question", questionId: row.id, partId: row.partId ?? undefined });
      break;
    }
    highest = Math.max(highest, index);
  }

  // ---- groups ------------------------------------------------------------------------------------------------------------------------------------
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const rowsByGroup = new Map<string, Numbered[]>();
  for (const row of numbered) if (row.groupId) rowsByGroup.set(row.groupId, [...(rowsByGroup.get(row.groupId) ?? []), row]);
  for (const group of input.groups) {
    const rows = rowsByGroup.get(group.id) ?? [];
    if (rows.length === 0) continue;
    const first = rows[0].startNumber;
    const last = rows[rows.length - 1].endNumber;
    if (!nonEmpty(group.instructions)) add("GROUP_INSTRUCTIONS", `Questions ${first}–${last} have no instructions.`, { kind: "group", groupId: group.id, partId: group.partId });
    if (group.startQuestion !== first || group.endQuestion !== last) {
      add("GROUP_RANGE", `Gap or overlap in the numbering: the group is stored as Questions ${group.startQuestion}–${group.endQuestion} but its questions are ${first}–${last}. Open the test in the editor and save it - the numbers are then recalculated.`, { kind: "group", groupId: group.id, partId: group.partId });
    }
  }
  // Rows with no group at all have no instructions either.
  const ungrouped = numbered.filter((row) => !row.groupId || !groupById.has(row.groupId));
  if (ungrouped.length > 0) add("GROUP_INSTRUCTIONS", `${questionLabel(ungrouped[0])}${ungrouped.length > 1 ? ` and ${ungrouped.length - 1} more` : ""} ${ungrouped.length > 1 ? "are" : "is"} not in a question group, so there are no instructions for ${ungrouped.length > 1 ? "them" : "it"}.`, { kind: "question", questionId: ungrouped[0].id, partId: ungrouped[0].partId ?? undefined });

  // ---- questions: text, answers, options ---------------------------------------------------------------------------------------------------------
  for (const row of numbered) issues.push(...checkQuestion(row, row.groupId ? (groupById.get(row.groupId)?.instructions ?? null) : null));

  // ---- Listening: the recording's length ------------------------------------------------------------------------------------------------------------
  if (listening) {
    const sources = [...new Set(input.parts.map((part) => part.audioSrc).filter((src): src is string => !!src))];
    for (const src of sources) {
      const holders = input.parts.filter((part) => part.audioSrc === src);
      if (holders.some((part) => part.audioDurationSeconds == null || part.audioDurationSeconds <= 0)) {
        add("AUDIO_DURATION", "A recording's length could not be read: upload the file again (MP3, WAV or M4A) so its length is stored.", { kind: "audio", partId: holders[0].id });
      }
    }

    // Phase L2 - ONE recording shared by every part: the start times of Parts 2-4 say where the screen turns to the next part. Optional (a test without
    // them keeps the old behaviour: the student turns the parts), but when they are given they must make sense.
    const shared = sources.length === 1 && input.parts.length > 1 && input.parts.every((part) => part.audioSrc === sources[0]);
    if (shared) {
      const length = input.parts.find((part) => part.audioDurationSeconds != null && part.audioDurationSeconds > 0)?.audioDurationSeconds ?? null;
      const given = input.parts.map((part, index) => (index === 0 ? null : (part.startSeconds ?? null)));
      const setCount = given.filter((value) => value != null).length;
      let previous = 0;
      input.parts.forEach((part, index) => {
        const at = given[index];
        if (index === 0 || at == null) return;
        const target: IssueTarget = { kind: "times", partId: part.id };
        if (at <= previous) add("AUDIO_START_TIMES", `${partName(index)} starts at ${formatTimeInput(at)}, which is not after ${index === 1 || given.slice(1, index).every((v) => v == null) ? "the start of the recording" : "the previous part"} (${formatTimeInput(previous)}): the start times must increase.`, target);
        else if (length != null && at >= length) add("AUDIO_START_TIMES", `${partName(index)} starts at ${formatTimeInput(at)}, but the recording is only ${formatTimeInput(length)} long.`, target);
        previous = Math.max(previous, at);
      });
      if (setCount > 0 && setCount < input.parts.length - 1) {
        add("AUDIO_START_TIMES", "Only some of the parts have a start time: the student's screen follows the recording only when Parts 2 to " + input.parts.length + " all have one, so these are ignored until the rest are set.", { kind: "times" }, "warning");
      }
    }
  }

  return { ok: !issues.some((issue) => issue.severity === "error"), issues, total, parts };
}
