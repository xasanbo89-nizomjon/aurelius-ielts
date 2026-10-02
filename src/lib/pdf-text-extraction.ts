import "server-only";
import pdfParse from "pdf-parse";

export class PdfTextExtractionError extends Error {
  constructor(message = "Could not read this PDF.") {
    super(message);
    this.name = "PdfTextExtractionError";
  }
}

const MIN_EXTRACTABLE_CHARS = 100;

/**
 * Phase 50 — the only place a PDF's bytes get turned into plain text. Throws
 * PdfTextExtractionError for a scanned/image-only PDF (no real text layer)
 * rather than silently handing the AI step a near-empty string and letting
 * it invent content to fill the gap.
 */
export async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  let result;
  try {
    result = await pdfParse(buffer);
  } catch (error) {
    throw new PdfTextExtractionError(error instanceof Error ? `Could not read this PDF: ${error.message}` : "Could not read this PDF.");
  }

  const text = result.text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (text.length < MIN_EXTRACTABLE_CHARS) {
    throw new PdfTextExtractionError(
      "This PDF has no extractable text — it looks like a scanned image. Upload a text-based PDF instead."
    );
  }

  return { text, pageCount: result.numpages };
}

export type DetectedSectionMarker = { label: string; index: number };

const PASSAGE_MARKER_PATTERN = /^[ \t]*(?:READING\s+)?PASSAGE\s+(\d+)\b.*$/gim;
const SECTION_MARKER_PATTERN = /^[ \t]*(?:LISTENING\s+)?SECTION\s+(\d+)\b.*$/gim;

/**
 * Phase 50.2 — a deterministic, regex-based pass that finds every real
 * "PASSAGE N" / "READING PASSAGE N" (Reading) or "SECTION N" / "LISTENING
 * SECTION N" (Listening) header actually printed in the PDF's text, BEFORE
 * the AI ever sees it. This exists because an LLM, left to its own
 * judgment on a long document, can merge multiple numbered passages into
 * one — the exact bug this phase fixes. The result is used two ways: (1)
 * injected into the extraction prompt as an explicit, unambiguous
 * boundary list the model must follow, and (2) checked against the model's
 * actual output afterward as a hard validation gate (see
 * extractTestStructureFromPdfText) — regex detects the ground truth, the
 * AI is only trusted to extract CONTENT within boundaries regex already
 * found, never to decide the boundaries exist at all.
 *
 * A real IELTS PDF typically reprints "PASSAGE 2" as a running header on
 * every page of that passage, not just once — this keeps only each
 * number's FIRST occurrence (its actual start), not every repeat.
 */
export function detectSectionMarkers(text: string, testType: "READING" | "LISTENING"): DetectedSectionMarker[] {
  const pattern = testType === "READING" ? PASSAGE_MARKER_PATTERN : SECTION_MARKER_PATTERN;
  pattern.lastIndex = 0;
  const matches = [...text.matchAll(pattern)];

  const firstByNumber = new Map<number, DetectedSectionMarker>();
  for (const match of matches) {
    const num = Number(match[1]);
    if (!Number.isFinite(num) || firstByNumber.has(num)) continue;
    firstByNumber.set(num, { label: match[0].trim().replace(/\s+/g, " ").slice(0, 80), index: match.index ?? 0 });
  }

  return [...firstByNumber.values()].sort((a, b) => a.index - b.index);
}

/**
 * Phase 50.3 — deterministically slices `text` into one chunk per detected
 * marker, from that marker's own start to the next marker's start (or end
 * of text for the last one). This is what makes "AI returns fewer passages
 * than detected" structurally impossible when markers.length >= 2: each
 * chunk is extracted in its own separate AI call
 * (extractTestStructureFromPdfText), so the result array's length is
 * exactly markers.length by construction — never dependent on the model
 * choosing to split correctly.
 */
export function splitTextByMarkers(text: string, markers: DetectedSectionMarker[]): string[] {
  return markers.map((marker, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    return text.slice(marker.index, end);
  });
}

// ---------------------------------------------------------------------------
// Phase 50.4 — question-block ("Questions 6–9") boundary detection. Same
// principle as passage markers above, one level down: a real IELTS paper
// prints every question block under a regular "Questions N–M" heading, so the
// set of blocks in a passage is something a regex can enumerate exactly —
// there is no reason to ask an LLM to *decide* how many blocks exist (it
// sometimes stops after the first one, which is the bug this phase fixes).
// ---------------------------------------------------------------------------

export type DetectedQuestionGroupMarker = { startNumber: number; endNumber: number; label: string; index: number };

// groups: 1 = first number, 2 = separator, 3 = last number, 4 = rest of the line
const GROUP_MARKER_PATTERN = /^[ \t]*Questions?[ \t]+(\d{1,3})[ \t]*([-‐-―−]|\bto\b|\band\b|&)[ \t]*(\d{1,3})(?!\d)([^\n]*)$/gim;

/**
 * A real block heading is the whole line ("Questions 6–9") or is followed by
 * the start of a new sentence/instruction ("Questions 1–5 Complete the notes").
 * A line that merely *starts* with the same words but continues an ordinary
 * sentence — "Questions 1–13, which are based on Reading Passage 1 below" once
 * the PDF has wrapped it — continues in lowercase or after a comma, which is
 * how the two are told apart.
 */
function isGroupHeaderRemainder(rest: string): boolean {
  const r = rest.trim();
  if (r === "") return true;
  if (/^[:.\-–—]/.test(r)) return true;
  return /^[A-Z(]/.test(r);
}

/**
 * Finds every real question-block heading in `text` (a single passage's
 * segment), in document order. Handles "Questions 6–9", "Questions 6-9",
 * "Questions 6 to 9" and "Questions 14 and 15" (a two-question block).
 * Repeats of the same heading (a running header on the block's second
 * page) keep only the first occurrence, and a passage-level container
 * heading ("Questions 1–13") is dropped when smaller blocks inside its range
 * follow it ("Questions 1–5", "6–9", "10–13") — the sub-blocks are the real
 * groups.
 */
export function detectQuestionGroupMarkers(text: string): DetectedQuestionGroupMarker[] {
  const found: DetectedQuestionGroupMarker[] = [];

  for (const match of text.matchAll(GROUP_MARKER_PATTERN)) {
    const startNumber = Number(match[1]);
    const endNumber = Number(match[3]);
    const separator = match[2].toLowerCase();
    if (!isGroupHeaderRemainder(match[4] ?? "")) continue;
    if (startNumber < 1 || endNumber < startNumber || endNumber > 200 || endNumber - startNumber > 60) continue;
    if ((separator === "and" || separator === "&") && endNumber !== startNumber + 1) continue;

    found.push({ startNumber, endNumber, label: `Questions ${startNumber}–${endNumber}`, index: match.index ?? 0 });
  }

  const seen = new Set<string>();
  const unique = found
    .sort((a, b) => a.index - b.index)
    .filter((m) => {
      const key = `${m.startNumber}-${m.endNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return unique.filter(
    (m, i) =>
      !unique
        .slice(i + 1)
        .some((later) => later.startNumber >= m.startNumber && later.endNumber <= m.endNumber && (later.startNumber !== m.startNumber || later.endNumber !== m.endNumber))
  );
}

const ANSWER_KEY_HEADING_PATTERN = /^[ \t]*(?:(?:READING|LISTENING)[ \t]+)?(?:ANSWER[ \t]*KEY|ANSWERS?|ANSWER[ \t]*SHEET|KEY)[ \t]*:?[ \t]*$/gim;

/**
 * The index where the answer key section starts, or null if there isn't a
 * real one. A bare "KEY"/"ANSWERS" line only counts if a numbered list
 * actually follows it, so a stray word in question text can never cut a
 * question block short.
 */
export function detectAnswerKeyStart(text: string): number | null {
  for (const match of text.matchAll(ANSWER_KEY_HEADING_PATTERN)) {
    const index = match.index ?? 0;
    const after = text.slice(index + match[0].length, index + match[0].length + 800);
    const numberedLines = after.split("\n").filter((line) => /^[ \t]*\d{1,2}[ \t]*[.):\-–]?[ \t]+\S/.test(line)).length;
    if (numberedLines >= 5) return index;
  }
  return null;
}

export type InferredQuestionType =
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE_NOT_GIVEN"
  | "FILL_IN_BLANK"
  | "MATCHING"
  | "SHORT_ANSWER"
  | "SENTENCE_COMPLETION"
  | "SUMMARY_COMPLETION";

/**
 * IELTS prints a fixed instruction for each question type ("Answer the
 * questions below", "Complete the sentences below", "Do the following
 * statements agree with…"), so the type of a block can be read from its
 * instruction deterministically rather than left to the model — which, left
 * to its own judgment, drifted to SUMMARY_COMPLETION for blocks that are
 * really sentence-completion or short-answer (a summary is a single string
 * to fill, the easiest path), even rewriting the questions into statements.
 * Only the instruction area at the top of the block is read, so wording deep
 * inside a question can't change the answer. Returns null when the wording
 * isn't recognised, in which case the model decides as before.
 * Order matters: matching is checked before the "complete each sentence…"
 * family because "Complete each sentence with the correct ending" is matching.
 */
export function inferQuestionTypeFromInstructions(blockText: string, firstQuestionNumber?: number): InferredQuestionType | null {
  // The instruction area ends where the first numbered question line begins ("6 Wetland areas…") — so wording inside the questions themselves, or any text that follows the block (an answer key's "TRUE/FALSE/NOT GIVEN" entries), can never retype it.
  let area = blockText;
  if (firstQuestionNumber != null) {
    const firstQuestionLine = new RegExp(`^[ \\t]*${firstQuestionNumber}[ \\t]*[.):]?[ \\t]+\\S`, "m").exec(blockText);
    if (firstQuestionLine && firstQuestionLine.index > 0) area = blockText.slice(0, firstQuestionLine.index);
  }
  const head = area.slice(0, 900);

  if (/\b(true|yes)\b[\s\S]{0,120}\b(false|no)\b[\s\S]{0,120}\bnot\s+given\b/i.test(head)) return "TRUE_FALSE_NOT_GIVEN";
  if (/list\s+of\s+headings|choose\s+the\s+correct\s+heading|correct\s+ending|which\s+paragraph\s+contains|match\s+(each|the)\b|matching\s+(headings|features|information|sentence)|you\s+may\s+use\s+any\s+letter\s+more\s+than\s+once/i.test(head)) return "MATCHING";
  if (/choose\s+the\s+correct\s+letter|choose\s+(two|three|four)\s+letters?/i.test(head)) return "MULTIPLE_CHOICE";
  if (/complete\s+the\s+(summary|passage)\b/i.test(head)) return "SUMMARY_COMPLETION";
  if (/answer\s+the\s+(following\s+)?questions?\b/i.test(head)) return "SHORT_ANSWER";
  if (/complete\s+(the|each)\s+sentences?\b/i.test(head)) return "SENTENCE_COMPLETION";
  if (/complete\s+the\s+(notes|table|flow-?\s?chart|form|diagram)\b/i.test(head)) return "FILL_IN_BLANK";
  return null;
}

export type QuestionGroupSlice = { marker: DetectedQuestionGroupMarker; text: string };

/**
 * Cuts one passage's segment into its body (everything before the first
 * question block) and one text slice per detected block — each running from
 * its own heading to the next block's heading, and never past
 * `answerKeyIndex` (so a trailing answer key can't leak into the last block).
 * Indexes are relative to `segmentText`.
 */
export function splitSegmentByQuestionGroups(
  segmentText: string,
  markers: DetectedQuestionGroupMarker[],
  answerKeyIndex: number | null
): { bodyText: string; groups: QuestionGroupSlice[] } {
  const limit = answerKeyIndex != null && answerKeyIndex >= 0 && answerKeyIndex < segmentText.length ? answerKeyIndex : segmentText.length;

  if (markers.length === 0) return { bodyText: segmentText.slice(0, limit), groups: [] };

  const bodyText = segmentText.slice(0, Math.min(markers[0].index, limit));
  const groups = markers
    .map((marker, i) => {
      const end = Math.min(i + 1 < markers.length ? markers[i + 1].index : limit, limit);
      return { marker, text: segmentText.slice(marker.index, Math.max(end, marker.index)) };
    })
    .filter((slice) => slice.text.trim().length > 0);

  return { bodyText, groups };
}
