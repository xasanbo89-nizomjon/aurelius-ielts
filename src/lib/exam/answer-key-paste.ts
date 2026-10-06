import { chooseWord } from "@/lib/exam/choose-many";
import { GROUP_KIND_META, expandAlternatives, layoutOf, type BuilderGroup, type BuilderModel } from "@/lib/exam/builder-model";

/**
 * Phase L2 - the answer key pasted in one go: "1 TRUE 2 FALSE 3 NOT GIVEN 4 carnivorous 5 B ...", or one answer per line, "/" between alternatives.
 * Pure and client-safe. The pasted text is only PARSED here; the editor shows the result as a table (question -> type -> parsed answer, mismatches in red)
 * and nothing is changed until the teacher confirms. An answer that cannot be right for its question (a "C" for a True / False / Not Given statement, a
 * "D" when the options are A-C, more words than the word limit allows) is a mismatch and is never written.
 */

export type ParsedKey = { entries: Map<number, string>; numbers: number[]; warnings: string[] };

const NUMBER_TOKEN = /^[Qq]?(\d{1,3})[.):]?$/;

/**
 * Splits the text into "number -> answer". Line by line when every line starts with a number (answers may then hold spaces: "NOT GIVEN", "the library");
 * otherwise by words, where a word that is the NEXT expected number starts the next answer (so "5 85 6 yes" reads Q5 = 85, Q6 = yes).
 */
export function parseAnswerKey(text: string): ParsedKey {
  const entries = new Map<number, string>();
  const numbers: number[] = [];
  const warnings: string[] = [];
  const add = (number: number, answer: string) => {
    const clean = answer.replace(/\s+/g, " ").trim().replace(/[,;]$/, "");
    if (entries.has(number)) warnings.push(`Question ${number} appears twice in the pasted key; the first answer is used.`);
    else {
      entries.set(number, clean);
      numbers.push(number);
    }
  };

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lineStart = /^[Qq]?(\d{1,3})\s*[.):\-–]?\s+(.*)$/;
  // Phase L3 - "21-22 A, D", "21&22 B E", "21 and 22 A D": one answer for the two numbers of a "Choose TWO" question
  const rangeStart = /^[Qq]?(\d{1,3})\s*(?:[-–&,]|and)\s*[Qq]?(\d{1,3})\s*[.):]?\s+(.*)$/i;
  if (lines.length > 1 && lines.every((line) => rangeStart.test(line) || lineStart.test(line) || /^[Qq]?\d{1,3}[.):]?$/.test(line))) {
    for (const line of lines) {
      const range = rangeStart.exec(line);
      if (range && Number(range[2]) > Number(range[1])) {
        add(Number(range[1]), range[3]);
        for (let n = Number(range[1]) + 1; n <= Number(range[2]); n++) add(n, "");
        continue;
      }
      const match = lineStart.exec(line);
      if (match) add(Number(match[1]), match[2]);
      else add(Number(line.replace(/\D/g, "")), "");
    }
    return { entries, numbers, warnings };
  }

  const tokens = text.split(/[\s]+/).filter(Boolean);
  let current: number | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (current !== null) add(current, buffer.join(" "));
    buffer = [];
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const numberMatch = NUMBER_TOKEN.exec(token);
    const number = numberMatch ? Number(numberMatch[1]) : null;
    const expected = current === null ? null : current + 1;
    const startsNext = number !== null && (current === null ? true : number === expected && index < tokens.length - 1);
    if (startsNext && number !== null) {
      flush();
      current = number;
    } else if (current !== null) {
      buffer.push(token);
    } else {
      warnings.push(`"${token}" comes before the first question number and was ignored.`);
    }
  }
  flush();
  return { entries, numbers, warnings };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------

export type KeyStatus = "ok" | "mismatch" | "missing";

export type KeyRow = {
  number: number;
  /** "21–22" for a "Choose TWO" question (it has two numbers); absent for a one-number question. */
  numberLabel?: string;
  /** A short piece of the question, so the teacher can see which one this is. */
  label: string;
  /** What kind of question it is ("True / False / Not Given"). */
  kindLabel: string;
  raw: string | null;
  /** What will be stored, in words ("NOT GIVEN", "B", "colour / color"). */
  parsed: string | null;
  status: KeyStatus;
  reason: string | null;
};

/** One thing the key answers: a question (a "Choose TWO" question has two numbers), a matching item or a blank. */
type Slot = { number: number; numbers: number[]; group: BuilderGroup; groupIndex: number; partIndex: number; index: number; label: string };

function slotsOf(model: BuilderModel): Slot[] {
  const layout = layoutOf(model);
  const slots: Slot[] = [];
  model.parts.forEach((part, partIndex) => {
    part.groups.forEach((group, groupIndex) => {
      const info = layout.parts[partIndex].groups[groupIndex];
      const meta = GROUP_KIND_META[group.kind];
      if (meta.perNumber) {
        info.itemRanges.forEach((range, index) => {
          const numbers = Array.from({ length: Math.max(0, range.last - range.first + 1) }, (_, i) => range.first + i);
          slots.push({ number: range.first, numbers, group, groupIndex, partIndex, index, label: group.items[index]?.prompt ?? "" });
        });
        return;
      }
      info.itemNumbers.forEach((number, index) => {
        const label = meta.stored === "MATCHING" ? (group.prompts[index]?.text ?? "") : `Blank ${index + 1} of the ${meta.label.toLowerCase()}`;
        slots.push({ number, numbers: [number], group, groupIndex, partIndex, index, label });
      });
    });
  });
  return slots;
}

/** What the pasted key says for a slot: the answers written against any of its numbers, in order ("21 A 22 D" -> "A D"; "21-22 A, D" -> "A, D"). */
function rawOf(key: ParsedKey, slot: Slot): string | undefined {
  const pieces = slot.numbers.map((n) => key.entries.get(n)).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (pieces.length > 0) return pieces.join(" ");
  return slot.numbers.some((n) => key.entries.has(n)) ? "" : undefined;
}

const TFNG: Record<string, string> = { T: "TRUE", TRUE: "TRUE", F: "FALSE", FALSE: "FALSE", NG: "NOT_GIVEN", N: "NOT_GIVEN", NOTGIVEN: "NOT_GIVEN", NOT_GIVEN: "NOT_GIVEN" };
const YNNG: Record<string, string> = { Y: "TRUE", YES: "TRUE", N: "FALSE", NO: "FALSE", NG: "NOT_GIVEN", NOTGIVEN: "NOT_GIVEN", NOT_GIVEN: "NOT_GIVEN" };
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];

export type Patch =
  | { kind: "tfng"; value: string }
  | { kind: "choices"; ids: string[] }
  | { kind: "answers"; answers: string[] }
  | { kind: "match"; optionId: string };

type Parsed = { ok: true; patch: Patch; display: string } | { ok: false; reason: string };

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function parseOne(slot: Slot, raw: string): Parsed {
  const { group } = slot;
  const meta = GROUP_KIND_META[group.kind];
  const upper = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if (!raw.trim()) return { ok: false, reason: "No answer was pasted for this question." };

  if (group.kind === "TRUE_FALSE_NOT_GIVEN") {
    const value = TFNG[upper];
    if (value) return { ok: true, patch: { kind: "tfng", value }, display: value.replace("_", " ") };
    if (YNNG[upper]) return { ok: false, reason: `"${raw}" is a Yes / No answer; this is a True / False / Not Given question.` };
    return { ok: false, reason: `"${raw}" is not a valid answer: use TRUE, FALSE or NOT GIVEN.` };
  }
  if (group.kind === "YES_NO_NOT_GIVEN") {
    const value = YNNG[upper];
    if (value) return { ok: true, patch: { kind: "tfng", value }, display: value === "TRUE" ? "YES" : value === "FALSE" ? "NO" : "NOT GIVEN" };
    if (upper === "TRUE" || upper === "FALSE" || upper === "T" || upper === "F") return { ok: false, reason: `"${raw}" is a True / False answer; this is a Yes / No / Not Given question.` };
    return { ok: false, reason: `"${raw}" is not a valid answer: use YES, NO or NOT GIVEN.` };
  }
  if (group.kind === "MULTIPLE_CHOICE") {
    const item = group.items[slot.index];
    const letters = (group.allowMultiple ? raw.toUpperCase().split(/[\s,/&]+|(?<=[A-Z])(?=[A-Z])/).filter(Boolean) : [raw.trim().toUpperCase()]).filter(Boolean);
    const known = new Set(item.choices.map((choice) => choice.id.toUpperCase()));
    const bad = letters.filter((letter) => !known.has(letter));
    if (letters.length === 0 || bad.length > 0) return { ok: false, reason: `"${raw}" is not one of the choices (${item.choices.map((c) => c.id).join(", ") || "none yet"}).` };
    if (!group.allowMultiple && letters.length > 1) return { ok: false, reason: `"${raw}" has several letters; this question has one answer.` };
    if (group.allowMultiple && new Set(letters).size !== letters.length) return { ok: false, reason: `"${raw}" repeats a letter; "Choose ${chooseWord(group.chooseCount)}" needs ${group.chooseCount} different letters.` };
    if (group.allowMultiple && letters.length !== group.chooseCount) return { ok: false, reason: `"${raw}" has ${letters.length} letter${letters.length === 1 ? "" : "s"}; "Choose ${chooseWord(group.chooseCount)}" needs ${group.chooseCount}.` };
    return { ok: true, patch: { kind: "choices", ids: letters.map((l) => item.choices.find((c) => c.id.toUpperCase() === l)!.id) }, display: letters.join(", ") };
  }
  if (meta.stored === "MATCHING") {
    const wanted = raw.trim().toLowerCase();
    const byDigit = /^\d+$/.test(wanted) && group.kind === "MATCHING_HEADINGS" ? ROMAN[Number(wanted) - 1] : undefined;
    const option = group.options.find((o) => o.id.toLowerCase() === wanted || o.id.toLowerCase() === byDigit);
    if (!option) return { ok: false, reason: `"${raw}" is not one of the options (${group.options.map((o) => o.id).join(", ") || "none yet"}).` };
    return { ok: true, patch: { kind: "match", optionId: option.id }, display: option.id };
  }
  // typed answers (sentence, short answer, form, summary / notes / table blanks)
  let answer = raw.trim();
  if (group.wordBank.length >= 2 && /^[A-Za-z]$/.test(answer)) {
    const word = group.wordBank[answer.toUpperCase().charCodeAt(0) - 65]?.trim();
    if (word) answer = word;
  }
  const answers = expandAlternatives(answer);
  if (answers.length === 0) return { ok: false, reason: "The answer is empty." };
  if (group.maxWords) {
    const longest = answers.reduce((a, b) => (wordCount(b) > wordCount(a) ? b : a), "");
    if (wordCount(longest) > group.maxWords) return { ok: false, reason: `"${longest}" has ${wordCount(longest)} words; the limit for this task is ${group.maxWords}.` };
  }
  return { ok: true, patch: { kind: "answers", answers }, display: answers.join(" / ") };
}

/** The table shown before anything is saved: every numbered question of the test with the answer parsed for it. */
export function previewAnswerKey(model: BuilderModel, key: ParsedKey): { rows: KeyRow[]; extra: number[] } {
  const slots = slotsOf(model);
  const known = new Set(slots.flatMap((slot) => slot.numbers));
  const rows: KeyRow[] = slots.map((slot) => {
    const kindLabel = GROUP_KIND_META[slot.group.kind].label;
    const label = slot.label.replace(/\s+/g, " ").trim().slice(0, 70);
    const raw = rawOf(key, slot);
    const numberLabel = slot.numbers.length > 1 ? `${slot.numbers[0]}–${slot.numbers[slot.numbers.length - 1]}` : undefined;
    if (raw === undefined) return { number: slot.number, numberLabel, label, kindLabel, raw: null, parsed: null, status: "missing", reason: "This question is not in the pasted key." };
    const parsed = parseOne(slot, raw);
    return parsed.ok
      ? { number: slot.number, numberLabel, label, kindLabel, raw, parsed: parsed.display, status: "ok", reason: null }
      : { number: slot.number, numberLabel, label, kindLabel, raw, parsed: null, status: "mismatch", reason: parsed.reason };
  });
  return { rows, extra: key.numbers.filter((n) => !known.has(n)) };
}

/** The model with every answer that parsed cleanly written in; mismatches and missing numbers are left exactly as they were. */
export function applyAnswerKey(model: BuilderModel, key: ParsedKey): { model: BuilderModel; applied: number } {
  const slots = slotsOf(model);
  const next: BuilderModel = JSON.parse(JSON.stringify(model));
  let applied = 0;
  for (const slot of slots) {
    const raw = rawOf(key, slot);
    if (raw === undefined) continue;
    const parsed = parseOne(slot, raw);
    if (!parsed.ok) continue;
    const group = next.parts[slot.partIndex].groups[slot.groupIndex];
    const patch = parsed.patch;
    if (patch.kind === "tfng") group.items[slot.index].tfng = patch.value;
    else if (patch.kind === "choices") group.items[slot.index].correctChoiceIds = patch.ids;
    else if (patch.kind === "match") group.matchAnswers[group.prompts[slot.index].id] = patch.optionId;
    else if (GROUP_KIND_META[group.kind].perNumber) group.items[slot.index].answers = patch.answers;
    else {
      while (group.blanks.length <= slot.index) group.blanks.push([]);
      group.blanks[slot.index] = patch.answers;
    }
    applied++;
  }
  return { model: next, applied };
}
