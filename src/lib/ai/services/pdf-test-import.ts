import "server-only";
import type { z } from "zod";

import { createStructuredCompletion } from "@/lib/ai/services/structured-completion";
import { AIServiceUnavailableError } from "@/lib/ai/errors";
import { normalizePassage } from "@/lib/text/normalizePassage";
import {
  detectSectionMarkers,
  splitTextByMarkers,
  detectQuestionGroupMarkers,
  detectAnswerKeyStart,
  splitSegmentByQuestionGroups,
  inferQuestionTypeFromInstructions,
  planListeningSegments,
  type DetectedQuestionGroupMarker,
  type InferredQuestionType,
} from "@/lib/pdf-text-extraction";
import {
  buildPdfTestExtractionPrompt,
  buildSinglePassageExtractionPrompt,
  buildTitleAndAnswersExtractionPrompt,
  buildPassageBodyExtractionPrompt,
  buildQuestionGroupExtractionPrompt,
  buildMissingQuestionsExtractionPrompt,
  buildMissingAnswersExtractionPrompt,
  questionNumberRange,
  pdfTestExtractionResponseSchema,
  extractedPassageSchema,
  extractedQuestionGroupSchema,
  titleAndAnswersResponseSchema,
  passageBodyResponseSchema,
  missingQuestionsResponseSchema,
  missingAnswersResponseSchema,
  PDF_TEST_EXTRACTION_JSON_SCHEMA,
  SINGLE_PASSAGE_EXTRACTION_JSON_SCHEMA,
  TITLE_AND_ANSWERS_JSON_SCHEMA,
  PASSAGE_BODY_JSON_SCHEMA,
  MISSING_QUESTIONS_JSON_SCHEMA,
  MISSING_ANSWERS_JSON_SCHEMA,
  questionGroupJsonSchema,
  type PdfTestExtractionResponse,
  type ExtractedPassage,
  type ExtractedQuestionGroup,
} from "@/lib/ai/prompts/pdf-test-import";
import {
  extractedQuestionNumbers,
  formatNumberRanges,
  validateImportedTest,
  type ValidationPassageInput,
} from "@/lib/exam/pdf-import-validation";

type CompletionArgs<T> = {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  responseSchema: z.ZodType<T>;
  temperature?: number;
  timeoutMs?: number;
};
/** The one dependency on the model — injectable so the control flow (retries, gap recovery) can be tested against a scripted model. */
export type CompletionFn = <T>(args: CompletionArgs<T>) => Promise<T>;

const EXTRACTION_TIMEOUT_MS = 120_000;
const BLOCK_TIMEOUT_MS = 90_000;
/** How many times the gap pass may ask a passage for the numbers still missing — the model sometimes returns only part of what it was asked for (39 of 39–40), and asking again for the remainder recovers it. */
const GAP_PASS_ROUNDS = 2;
/** ~25k tokens of headroom for a 128k-context model, leaving plenty of room for a large structured JSON reply — comfortably above a real full-length IELTS test's PDF text. */
const MAX_PDF_TEXT_CHARS = 100_000;
const MAX_CONCURRENT_AI_CALLS = 6;
const MAX_AI_ATTEMPTS = 3;
/** A Reading passage whose pre-question text is shorter than this is probably laid out with its questions first — hand the model the whole segment (told to return only the passage text) instead. */
const MIN_BODY_CHARS = 200;
/** A section whose text (after its heading) is shorter than this has no questions to extract. */
const MIN_SECTION_TEXT_CHARS = 60;
const NO_TRANSCRIPT_NOTE = "No transcript included in this PDF — audio must be added separately.";

/**
 * Phase 50.2/50.3 — the validation gate for the multi-passage merging bug:
 * detectSectionMarkers already knows the real number of passage/section
 * headers in the document BEFORE the AI ever runs. Since Phase 50.3, when
 * 2+ markers are detected this is a defensive invariant check that should
 * never actually fire (the split-then-extract path makes the result
 * count exactly match the marker count by construction) — it stays as a
 * safety net for the whole-document fallback path (no markers) and in case
 * a future change breaks that invariant. Exported standalone so this
 * comparison is unit-testable without a live OpenAI call.
 */
export function assertPassageCountMatches(detectedMarkerCount: number, extractedPassageCount: number, markerLabels: string[]): void {
  if (detectedMarkerCount >= 2 && extractedPassageCount < detectedMarkerCount) {
    throw new AIServiceUnavailableError(
      `Detected ${detectedMarkerCount} passage/section headers in this PDF (${markerLabels.join(", ")}) but only extracted ${extractedPassageCount}. Try analyzing again.`
    );
  }
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= limit) return;
    const run = queue.shift();
    if (!run) return;
    active++;
    run();
  };
  return function limited<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

async function withRetry<T>(fn: () => Promise<T>, attempts = MAX_AI_ATTEMPTS): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!(error instanceof AIServiceUnavailableError) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }
  throw lastError;
}

function uniqueBy<T>(items: T[], key: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** "READING PASSAGE 1" -> "Reading Passage 1"; anything already in mixed case is left alone. */
function tidyLabel(label: string): string {
  const collapsed = label.replace(/\s+/g, " ").trim();
  if (collapsed !== collapsed.toUpperCase()) return collapsed;
  return collapsed.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Pins a block's range to what the heading says (the model is not trusted to
 * report it), drops anything outside that range, and removes repeated numbers.
 */
function normalizeGroup(raw: ExtractedQuestionGroup, startNumber: number, endNumber: number): ExtractedQuestionGroup {
  const inRange = (n: number) => Number.isInteger(n) && n >= startNumber && n <= endNumber;
  const items = uniqueBy(
    raw.items.filter((item) => inRange(item.number)),
    (item) => item.number
  ).sort((a, b) => a.number - b.number);
  const matchingPrompts = uniqueBy(
    raw.matchingPrompts.filter((p) => inRange(Number(p.id))).map((p) => ({ ...p, id: String(Number(p.id)) })),
    (p) => p.id
  ).sort((a, b) => Number(a.id) - Number(b.id));
  return { ...raw, startNumber, endNumber, instructions: raw.instructions.trim() || "Answer the following.", items, matchingPrompts };
}

function missingFrom(group: ExtractedQuestionGroup): number[] {
  const have = new Set(extractedQuestionNumbers(group));
  return questionNumberRange(group.startNumber, group.endNumber).filter((n) => !have.has(n));
}

/** A word list made of bare letters ("A", "B"…) means the model copied the labels instead of the words. */
function wordBankIsJustLabels(group: ExtractedQuestionGroup): boolean {
  return group.wordBank.length > 0 && group.wordBank.every((w) => /^[A-Za-z]$/.test(w.trim()));
}

/** Higher is better: completeness first, then the right type, then a usable word list. */
function attemptQuality(group: ExtractedQuestionGroup, expectedType: InferredQuestionType | null): number {
  return extractedQuestionNumbers(group).length * 10 + (expectedType && group.questionType === expectedType ? 5 : 0) + (wordBankIsJustLabels(group) ? 0 : 2);
}

function needsAnotherAttempt(group: ExtractedQuestionGroup, expectedType: InferredQuestionType | null): string[] {
  const reasons: string[] = [];
  const missing = missingFrom(group);
  if (missing.length > 0) reasons.push(`missed question number${missing.length === 1 ? "" : "s"} ${formatNumberRanges(missing)}`);
  if (expectedType && group.questionType !== expectedType) reasons.push(`gave questionType ${group.questionType} instead of ${expectedType}`);
  if (wordBankIsJustLabels(group)) reasons.push("returned letters (A, B, C…) in wordBank instead of the words in the word list");
  return reasons;
}

/** Combines two attempts at the same block: the better one wins, and numbers only the other produced are filled in. */
function mergeAttempts(first: ExtractedQuestionGroup, second: ExtractedQuestionGroup, expectedType: InferredQuestionType | null): ExtractedQuestionGroup {
  const [primary, other] = attemptQuality(second, expectedType) > attemptQuality(first, expectedType) ? [second, first] : [first, second];
  if (primary.questionType !== other.questionType) return primary;

  if (primary.questionType === "MATCHING") {
    return {
      ...primary,
      matchingPrompts: uniqueBy([...primary.matchingPrompts, ...other.matchingPrompts], (p) => p.id).sort((a, b) => Number(a.id) - Number(b.id)),
      matchingOptions: primary.matchingOptions.length >= other.matchingOptions.length ? primary.matchingOptions : other.matchingOptions,
    };
  }
  if (primary.questionType === "SUMMARY_COMPLETION") {
    return { ...primary, summaryText: primary.summaryText?.trim() ? primary.summaryText : other.summaryText };
  }
  return { ...primary, items: uniqueBy([...primary.items, ...other.items], (item) => item.number).sort((a, b) => a.number - b.number) };
}

/** Whether most of what a model returned for a recovered question really appears in the source text — a guard against invented questions in the gap-recovery pass. */
function isGrounded(candidate: string, source: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
  const haystack = ` ${normalize(source)} `;
  const words = normalize(candidate)
    .split(" ")
    .filter((w) => w.length >= 4);
  if (words.length === 0) return true;
  const found = words.filter((w) => haystack.includes(` ${w} `)).length;
  return found / words.length >= 0.6;
}

function groupText(group: ExtractedQuestionGroup): string {
  if (group.questionType === "SUMMARY_COMPLETION") return group.summaryText ?? "";
  if (group.questionType === "MATCHING") return [...group.matchingPrompts, ...group.matchingOptions].map((c) => c.text).join(" ");
  return group.items.map((item) => item.prompt).join(" ");
}

function toValidationPassages(passages: ExtractedPassage[]): ValidationPassageInput[] {
  return passages.map((passage, pIndex) => ({
    id: `p${pIndex}`,
    title: passage.title,
    questionGroups: passage.questionGroups.map((group, gIndex) => ({
      id: `p${pIndex}g${gIndex}`,
      startNumber: group.startNumber,
      endNumber: group.endNumber,
      questionType: group.questionType,
      instructions: group.instructions,
      questionsJson: {
        summaryText: group.summaryText,
        wordBank: group.wordBank,
        maxWords: group.maxWords,
        matchingPrompts: group.matchingPrompts,
        matchingOptions: group.matchingOptions,
        items: group.items,
      },
    })),
  }));
}

function runsOf(numbers: number[]): number[][] {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === n - 1) last.push(n);
    else runs.push([n]);
  }
  return runs;
}

// ---------------------------------------------------------------------------
// The extractor
// ---------------------------------------------------------------------------

/**
 * Phase 50 — turns raw PDF text into a structured draft (passages, question
 * groups, answer key) for teacher review.
 *
 * Phase 50.3 fixed "AI merges passages" by splitting the text at the
 * deterministically-detected passage markers. Phase 50.4 applies the same
 * principle one level down to fix "AI returns only the first question
 * blocks of a passage" (Passage 1 -> only Q1-5): each passage's question
 * blocks are found by regex ("Questions 6–9"), every block is extracted in
 * its OWN small call told exactly which numbers it must contain (and retried
 * with the missing numbers named if it under-delivers), the passage text is
 * extracted separately, and any number the answer key proves should exist
 * but no block produced is recovered by a final, grounded gap pass. The
 * model is only ever trusted to read content inside boundaries the regex
 * already established — never to decide how many blocks exist.
 */
export function createPdfTestExtractor(complete: CompletionFn) {
  const limit = createLimiter(MAX_CONCURRENT_AI_CALLS);
  const call = <T>(args: CompletionArgs<T>) => limit(() => withRetry(() => complete(args)));

  async function extractWholeDocument(testType: "READING" | "LISTENING", pdfText: string): Promise<PdfTestExtractionResponse> {
    const { system, user } = buildPdfTestExtractionPrompt({ testType, pdfText });
    return call({ system, user, schemaName: "pdf_test_import", jsonSchema: PDF_TEST_EXTRACTION_JSON_SCHEMA, responseSchema: pdfTestExtractionResponseSchema, temperature: 0.1, timeoutMs: EXTRACTION_TIMEOUT_MS });
  }

  async function extractTitleAndAnswers(testType: "READING" | "LISTENING", pdfText: string) {
    const { system, user } = buildTitleAndAnswersExtractionPrompt({ testType, pdfText });
    return call({ system, user, schemaName: "pdf_test_import_title_answers", jsonSchema: TITLE_AND_ANSWERS_JSON_SCHEMA, responseSchema: titleAndAnswersResponseSchema, temperature: 0.1, timeoutMs: EXTRACTION_TIMEOUT_MS });
  }

  /** Legacy best-effort path, now only used for a passage whose question-block headings couldn't be found by regex. */
  async function extractWholePassage(testType: "READING" | "LISTENING", label: string, text: string): Promise<ExtractedPassage> {
    const { system, user } = buildSinglePassageExtractionPrompt({ testType, passageLabel: label, passageText: text });
    return call({ system, user, schemaName: "pdf_test_import_single_passage", jsonSchema: SINGLE_PASSAGE_EXTRACTION_JSON_SCHEMA, responseSchema: extractedPassageSchema, temperature: 0.1, timeoutMs: EXTRACTION_TIMEOUT_MS });
  }

  async function extractPassageBody(testType: "READING" | "LISTENING", label: string, text: string) {
    if (text.trim().length === 0) return { title: tidyLabel(label), content: testType === "LISTENING" ? NO_TRANSCRIPT_NOTE : "" };
    const { system, user } = buildPassageBodyExtractionPrompt({ testType, passageLabel: label, text });
    const body = await call({ system, user, schemaName: "pdf_test_import_passage_body", jsonSchema: PASSAGE_BODY_JSON_SCHEMA, responseSchema: passageBodyResponseSchema, temperature: 0.1, timeoutMs: EXTRACTION_TIMEOUT_MS });
    return { title: body.title.trim() || tidyLabel(label), content: body.content };
  }

  async function extractQuestionBlock(
    testType: "READING" | "LISTENING",
    label: string,
    marker: DetectedQuestionGroupMarker,
    text: string,
    expectedType: InferredQuestionType | null,
    retryNotes?: string[]
  ): Promise<ExtractedQuestionGroup> {
    const { system, user } = buildQuestionGroupExtractionPrompt({
      testType,
      passageLabel: label,
      startNumber: marker.startNumber,
      endNumber: marker.endNumber,
      groupText: text,
      retryNotes,
      expectedType,
    });
    const raw = await call({ system, user, schemaName: "pdf_test_import_question_block", jsonSchema: questionGroupJsonSchema, responseSchema: extractedQuestionGroupSchema, temperature: 0.1, timeoutMs: BLOCK_TIMEOUT_MS });
    return normalizeGroup(raw, marker.startNumber, marker.endNumber);
  }

  /** One block, one call — and if it under-delivers (missing numbers, wrong type, labels instead of words), one more call that says exactly what was wrong. */
  async function extractQuestionBlockComplete(
    testType: "READING" | "LISTENING",
    label: string,
    marker: DetectedQuestionGroupMarker,
    text: string
  ): Promise<ExtractedQuestionGroup> {
    const expectedType = inferQuestionTypeFromInstructions(text, marker.startNumber);
    const first = await extractQuestionBlock(testType, label, marker, text, expectedType);
    const problems = needsAnotherAttempt(first, expectedType);
    if (problems.length === 0) return first;

    console.log(`[pdf-test-import] ${label} ${marker.label}: first pass ${problems.join("; ")} — retrying`);
    const second = await extractQuestionBlock(testType, label, marker, text, expectedType, problems);
    const merged = mergeAttempts(first, second, expectedType);
    const remaining = needsAnotherAttempt(merged, expectedType);
    if (remaining.length > 0) console.log(`[pdf-test-import] ${label} ${marker.label}: after retry still ${remaining.join("; ")}`);
    return merged;
  }

  async function buildPassage(
    testType: "READING" | "LISTENING",
    label: string,
    segmentText: string,
    answerKeyRelative: number | null
  ): Promise<ExtractedPassage> {
    // A segment that starts after the answer key (a negative offset) has nothing usable in it; one that contains the key stops there.
    const cutoff = answerKeyRelative != null && answerKeyRelative < segmentText.length ? Math.max(0, answerKeyRelative) : segmentText.length;
    const usableText = segmentText.slice(0, cutoff);
    const markers = detectQuestionGroupMarkers(usableText);

    // Nothing but a heading (or nothing at all): there is nothing to read, and asking the model anyway is how questions get invented. The section stays empty and the completeness gate reports it.
    if (usableText.replace(/\s+/g, " ").trim().length < MIN_SECTION_TEXT_CHARS) {
      console.log(`[pdf-test-import] ${label}: no text to read — left empty`);
      return { title: tidyLabel(label), content: "", questionGroups: [] };
    }

    console.log(`[pdf-test-import] ${label}: detectedQuestionBlocks=${markers.length}`, markers.map((m) => m.label));

    if (markers.length === 0) {
      // No recognisable "Questions N–M" headings: fall back to letting the model read the whole passage (best effort; the validation gate still judges the result).
      return extractWholePassage(testType, label, usableText);
    }

    const slices = splitSegmentByQuestionGroups(usableText, markers, null);
    const bodyInput = testType === "READING" && slices.bodyText.trim().length < MIN_BODY_CHARS ? usableText : slices.bodyText;

    const [body, groups] = await Promise.all([
      extractPassageBody(testType, label, bodyInput),
      Promise.all(slices.groups.map((slice) => extractQuestionBlockComplete(testType, label, slice.marker, slice.text))),
    ]);

    return { title: body.title, content: body.content, questionGroups: groups.sort((a, b) => a.startNumber - b.startNumber) };
  }

  /**
   * Last line of defence: the answer key proves certain question numbers
   * exist, but no detected block produced them (a heading the regex couldn't
   * read). Ask for exactly those numbers from the passage most likely to hold
   * them, keep only what is really in that text, and never overwrite a number
   * that is already covered.
   */
  async function recoverMissingQuestions(
    testType: "READING" | "LISTENING",
    passages: ExtractedPassage[],
    segments: { label: string; text: string }[],
    answerNumbers: number[]
  ): Promise<void> {
    if (answerNumbers.length === 0) return;

    const initial = validateImportedTest(toValidationPassages(passages), answerNumbers);
    if (initial.missingNumbers.length === 0) return;

    for (const run of runsOf(initial.missingNumbers)) {
      const current = validateImportedTest(toValidationPassages(passages), answerNumbers);
      const stillMissing = run.filter((n) => current.missingNumbers.includes(n));
      if (stillMissing.length === 0) continue;

      // Candidate passages for this run, best guess first: the passage whose own extracted span already contains the gap (unambiguous — e.g. Q32–36 inside a passage that has 27–31 and 37–40), then an empty passage sitting inside the gap, then the passage just before it (its tail), then the one just after (its head).
      const ranges = current.passages.map((p) => p.extractedRange);
      const first = stillMissing[0];
      const last = stillMissing[stillMissing.length - 1];
      const containing = ranges.findIndex((r) => r && r.start <= first && r.end >= last);
      const before = ranges.reduce((acc, r, i) => (r && r.end < first ? i : acc), -1);
      const after = ranges.findIndex((r) => r && r.start > last);
      const lo = before === -1 ? 0 : before;
      const hi = after === -1 ? passages.length - 1 : after;
      const empties = ranges.map((r, i) => (r === null && i >= lo && i <= hi ? i : -1)).filter((i) => i !== -1);
      const candidates = uniqueBy([containing, ...empties, before, after].filter((i) => i >= 0), (i) => i);

      const coveredNow = (n: number) => validateImportedTest(toValidationPassages(passages), answerNumbers).passages.some((p) => p.groups.some((g) => g.extractedNumbers.includes(n)));
      // The model sometimes answers only part of what it was asked (asked for 39–40, returned 39): a second round asks again for just what is still open.
      for (let round = 0; round < GAP_PASS_ROUNDS; round++) {
        if (stillMissing.every((n) => coveredNow(n))) break;
        for (const index of candidates) {
          const open = stillMissing.filter((n) => !coveredNow(n));
          if (open.length === 0) break;

          console.log(`[pdf-test-import] gap pass: asking ${segments[index].label} for ${formatNumberRanges(open)}`);
          const { system, user } = buildMissingQuestionsExtractionPrompt({ testType, passageLabel: segments[index].label, missingNumbers: open, text: segments[index].text });
          let response;
          try {
            response = await call({ system, user, schemaName: "pdf_test_import_missing_questions", jsonSchema: MISSING_QUESTIONS_JSON_SCHEMA, responseSchema: missingQuestionsResponseSchema, temperature: 0.1, timeoutMs: BLOCK_TIMEOUT_MS });
          } catch (error) {
            console.log(`[pdf-test-import] gap pass failed for ${segments[index].label}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
          }

          const openSet = new Set(open);
          for (const returned of response.questionGroups) {
            const numbers = extractedQuestionNumbers(returned).filter((n) => openSet.has(n));
            if (numbers.length === 0) continue;

            const kept: ExtractedQuestionGroup = {
              ...returned,
              startNumber: Math.min(...numbers),
              endNumber: Math.max(...numbers),
              items: returned.items.filter((item) => openSet.has(item.number)),
              matchingPrompts: returned.matchingPrompts.filter((p) => openSet.has(Number(p.id))),
            };
            // A summary covers its whole range at once — only accept it if every number in that range is one we still need.
            if (kept.questionType === "SUMMARY_COMPLETION" && questionNumberRange(returned.startNumber, returned.endNumber).some((n) => !openSet.has(n))) continue;
            if (kept.questionType === "SUMMARY_COMPLETION") {
              kept.startNumber = returned.startNumber;
              kept.endNumber = returned.endNumber;
            }
            if (!isGrounded(groupText(kept), segments[index].text)) {
              console.log(`[pdf-test-import] gap pass: dropped ${kept.questionType} Q${kept.startNumber}-${kept.endNumber} — its text isn't in ${segments[index].label}`);
              continue;
            }

            passages[index].questionGroups = [...passages[index].questionGroups, normalizeGroup(kept, kept.startNumber, kept.endNumber)].sort((a, b) => a.startNumber - b.startNumber);
            console.log(`[pdf-test-import] gap pass: recovered Q${kept.startNumber}-${kept.endNumber} into ${segments[index].label}`);
          }
        }
      }
    }
  }

  /**
   * The questions are known (extracted) but the one-shot answer extraction
   * dropped some of their answers: ask again, by number, from just the
   * answer-key text. Only numbers that are really missing are accepted, an
   * answer is kept only if it appears in that text, and an answer already
   * found is never overwritten.
   */
  async function recoverMissingAnswers(
    testType: "READING" | "LISTENING",
    passages: ExtractedPassage[],
    answers: { number: number; answer: string }[],
    keyText: string
  ): Promise<{ number: number; answer: string }[]> {
    const questionNumbers = new Set(validateImportedTest(toValidationPassages(passages), []).passages.flatMap((p) => p.groups.flatMap((g) => g.extractedNumbers)));
    let result = [...answers];

    for (let attempt = 0; attempt < 2; attempt++) {
      const have = new Set(result.map((a) => a.number));
      const missing = [...questionNumbers].filter((n) => !have.has(n)).sort((a, b) => a - b);
      if (missing.length === 0) return result;

      console.log(`[pdf-test-import] answer pass ${attempt + 1}: asking the answer key for ${formatNumberRanges(missing)}`);
      const { system, user } = buildMissingAnswersExtractionPrompt({ testType, missingNumbers: missing, keyText });
      try {
        const response = await call({ system, user, schemaName: "pdf_test_import_missing_answers", jsonSchema: MISSING_ANSWERS_JSON_SCHEMA, responseSchema: missingAnswersResponseSchema, temperature: 0, timeoutMs: BLOCK_TIMEOUT_MS });
        const wanted = new Set(missing);
        const squash = (value: string) => value.toLowerCase().replace(/\s+/g, " ");
        const haystack = squash(keyText);
        for (const entry of response.answers) {
          const answer = entry.answer.trim();
          if (!wanted.has(entry.number) || answer.length === 0) continue;
          if (!haystack.includes(squash(answer))) continue; // not actually printed in the key — never accept an invented answer
          if (!result.some((a) => a.number === entry.number)) result = [...result, { number: entry.number, answer }];
        }
      } catch (error) {
        console.log(`[pdf-test-import] answer pass failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return result;
  }

  async function extract(testType: "READING" | "LISTENING", pdfText: string): Promise<PdfTestExtractionResponse> {
    const clampedText = pdfText.length > MAX_PDF_TEXT_CHARS ? pdfText.slice(0, MAX_PDF_TEXT_CHARS) : pdfText;
    let detectedMarkers: { label: string; index: number; number: number }[] = detectSectionMarkers(clampedText, testType);

    // Phase B — a Listening paper is four parts of ten questions; when its printed part headings don't agree with its question numbers (a missing "PART 2", pages out of order or repeated — common in scans), rebuild the parts from the question ranges instead of cutting at the wrong headings.
    const listeningPlan = testType === "LISTENING" ? planListeningSegments(clampedText) : null;
    const rebuilt = listeningPlan?.strategy === "question-ranges" ? listeningPlan.sections : null;
    if (rebuilt) {
      detectedMarkers = rebuilt.map((section, i) => ({ label: section.label, index: i, number: i + 1 }));
      listeningPlan?.notes.forEach((note) => console.log(`[pdf-test-import] ${note}`));
    }

    console.log(`[pdf-test-import] detectedPassages=${detectedMarkers.length}`, detectedMarkers.map((m) => m.label));

    let result: PdfTestExtractionResponse;

    if (!rebuilt && detectedMarkers.length === 0 && detectQuestionGroupMarkers(clampedText).length === 0) {
      // Neither passage headings nor question-block headings are recognisable: the model reads the whole document (best effort, then validated below).
      result = await extractWholeDocument(testType, clampedText);
    } else {
      const sectionName = testType === "READING" ? "Passage" : "Section";
      const segmentTexts = rebuilt ? rebuilt.map((section) => section.text) : detectedMarkers.length > 0 ? splitTextByMarkers(clampedText, detectedMarkers) : [clampedText];
      const segmentStarts = rebuilt ? rebuilt.map(() => 0) : detectedMarkers.length > 0 ? detectedMarkers.map((m) => m.index) : [0];
      const labels = detectedMarkers.length > 0 ? detectedMarkers.map((m, i) => tidyLabel(m.label) || `${sectionName} ${i + 1}`) : [`${sectionName} 1`];
      // Rebuilt sections never include the answer key (it was cut off before they were assembled), so they have no key position of their own.
      const answerKeyAbsolute = detectAnswerKeyStart(clampedText);
      const keyRelativeTo = (i: number) => (rebuilt ? null : answerKeyAbsolute != null ? answerKeyAbsolute - segmentStarts[i] : null);

      const [titleAndAnswers, passages] = await Promise.all([
        extractTitleAndAnswers(testType, clampedText),
        Promise.all(segmentTexts.map((text, i) => buildPassage(testType, labels[i], text, keyRelativeTo(i)))),
      ]);

      await recoverMissingQuestions(
        testType,
        passages,
        segmentTexts.map((text, i) => {
          const key = keyRelativeTo(i);
          return { label: labels[i], text: key != null && key >= 0 && key < text.length ? text.slice(0, key) : text };
        }),
        titleAndAnswers.answers.map((a) => a.number)
      );

      const keyText = answerKeyAbsolute != null ? clampedText.slice(answerKeyAbsolute) : clampedText;
      // An entry with no text means the key could not be read at that number; treat it as missing so the by-number recovery below gets a chance, and so the completeness check reports it if it stays missing.
      const keyedAnswers = titleAndAnswers.answers.filter((a) => a.answer.trim().length > 0);
      const answers = await recoverMissingAnswers(testType, passages, keyedAnswers, keyText);

      result = { title: titleAndAnswers.title, answers, passages };
    }

    // Phase G0 — a PDF keeps the page's own line ends; a Reading passage must read as running text (paragraph breaks, paragraph letters and headings are kept).
    if (testType === "READING") result.passages = result.passages.map((passage) => ({ ...passage, content: normalizePassage(passage.content) }));

    console.log(`[pdf-test-import] extractedPassages=${result.passages.length}`);
    const validation = validateImportedTest(toValidationPassages(result.passages), result.answers.map((a) => a.number));
    result.passages.forEach((passage, i) => {
      console.log(`[pdf-test-import] ${passage.title || `passage ${i + 1}`}: extractedQuestions=${validation.passages[i]?.questionCount ?? 0}${validation.passages[i]?.extractedRange ? ` (${validation.passages[i].extractedRange!.start}–${validation.passages[i].extractedRange!.end})` : ""}`);
    });
    console.log(`[pdf-test-import] totalQuestions=${validation.totalQuestions} answerKeyEntries=${validation.answerCount} validationIssues=${validation.issues.length}`, validation.issues.map((issue) => issue.message));

    assertPassageCountMatches(
      detectedMarkers.length,
      result.passages.length,
      detectedMarkers.map((m) => m.label)
    );

    return result;
  }

  return { extract };
}

export async function extractTestStructureFromPdfText(testType: "READING" | "LISTENING", pdfText: string): Promise<PdfTestExtractionResponse> {
  return createPdfTestExtractor(createStructuredCompletion).extract(testType, pdfText);
}
