import "server-only";
import pdfParse from "pdf-parse";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream } from "pdf-lib";

import { ocrPdfPages, PdfOcrError } from "@/lib/pdf-ocr";
import { LISTENING_PART_COUNT, listeningPartOf } from "@/lib/exam/listening-structure";

export { LISTENING_PART_COUNT, LISTENING_QUESTIONS_PER_PART, listeningPartOf } from "@/lib/exam/listening-structure";

export class PdfTextExtractionError extends Error {
  constructor(message = "Could not read this PDF.") {
    super(message);
    this.name = "PdfTextExtractionError";
  }
}

const MIN_EXTRACTABLE_CHARS = 100;
/** A page with fewer characters than this has no usable text layer (scan, photo, image-only export) and goes to OCR. */
const MIN_PAGE_TEXT_CHARS = 25;
/**
 * A page that carries an image AND only a sliver of text is almost always a scan whose only "text" is a running header or page number ("Test 2 · Page 14") — or a diagram page whose labels live in the picture. Real typed pages have far more than this, and OCR-ing a page that didn't need it is harmless, so such pages are read too.
 */
const MAX_TEXT_CHARS_FOR_IMAGE_PAGE = 150;
/** An image smaller than this (in pixels, each side) is a logo, bullet or icon — not a scanned page or a diagram. */
const MIN_PAGE_IMAGE_PIXELS = 300;

/**
 * How many page-sized images each page of the PDF carries, read from the
 * pages' own resource tables with pdf-lib — nothing is decoded or rendered.
 * (Asking pdf.js for a page's operator list instead looks tempting but makes it
 * decode embedded JPEGs through a browser-only Image() that doesn't exist on
 * the server, which takes the whole process down.) null when the file can't be
 * inspected, in which case pages are judged by their text alone.
 */
export async function countPageImages(buffer: Buffer): Promise<number[] | null> {
  try {
    const doc = await PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    return doc.getPages().map((page) => {
      const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
      if (!xobjects) return 0;
      let count = 0;
      for (const [, ref] of xobjects.entries()) {
        const object = xobjects.context.lookup(ref);
        const dict = object instanceof PDFRawStream || object instanceof PDFStream ? object.dict : null;
        if (!dict || dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
        const width = dict.lookupMaybe(PDFName.of("Width"), PDFNumber)?.asNumber() ?? 0;
        const height = dict.lookupMaybe(PDFName.of("Height"), PDFNumber)?.asNumber() ?? 0;
        if (width >= MIN_PAGE_IMAGE_PIXELS && height >= MIN_PAGE_IMAGE_PIXELS) count++;
      }
      return count;
    });
  } catch {
    return null;
  }
}

/** Whether a page's own text layer is too thin to trust, given how much text it has and whether it paints any image. Exported for testing. */
export function pageNeedsOcr(textLength: number, imageCount: number): boolean {
  if (textLength < MIN_PAGE_TEXT_CHARS) return true;
  return imageCount > 0 && textLength < MAX_TEXT_CHARS_FOR_IMAGE_PAGE;
}

/**
 * Phase 50 — the only place a PDF's bytes get turned into plain text.
 *
 * Phase A — reads each page's own text layer first (free, exact), and sends
 * ONLY the pages that have none (scans, photographed pages, image-only
 * exports) to OCR (see ocrPdfPages). So all three kinds of PDF work: a normal
 * text PDF never touches OCR, a fully scanned one is OCR'd page by page, and a
 * mixed one (e.g. typed questions + a scanned answer key) gets each page the
 * way it needs. The combined text then flows through the identical
 * section → question → answer-key pipeline. Still throws
 * PdfTextExtractionError when, after OCR, there is nothing readable — rather
 * than handing the AI step a near-empty string and letting it invent content.
 */
export async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number; ocrPageCount: number }> {
  const pageTexts: string[] = [];
  let pageCount = 0;

  // The pdf.js bundled in pdf-parse (v1.10) must be handed a plain Uint8Array, not a Node Buffer (which is what fs and Storage downloads give us). With a Buffer it intermittently fails valid files with "bad XRef entry", or returns the PREVIOUS document's page count and no text when two different PDFs are parsed back to back in one long-lived server process — to a teacher, a good PDF with "no extractable text". Found by alternating different PDFs: with a Buffer roughly a third of the parses came back wrong; with a fresh Uint8Array copy every one was right. (Most likely cause: Buffer's slice() returns shared views, not copies, which pdf.js 1.10 does not expect.)
  const parseOnce = async () => {
    pageTexts.length = 0;
    return pdfParse(new Uint8Array(buffer) as unknown as Buffer, {
      // Same per-page rendering pdf-parse does by default, but keeping each page's text separate so image-only pages can be told apart.
      pagerender: async (pageData: { getTextContent: (options: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }) => Promise<{ items: { str: string; transform: number[] }[] }> }) => {
        const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
        let lastY: number | undefined;
        let text = "";
        for (const item of content.items) {
          text += lastY === item.transform[5] || !lastY ? item.str : "\n" + item.str;
          lastY = item.transform[5];
        }
        pageTexts.push(text);
        return text;
      },
    });
  };

  try {
    pageCount = (await parseOnce()).numpages;
  } catch (error) {
    throw new PdfTextExtractionError(error instanceof Error ? `Could not read this PDF: ${error.message}` : "Could not read this PDF.");
  }

  const pageImageCounts = (await countPageImages(buffer)) ?? [];
  const scannedPages = pageTexts.map((text, index) => (pageNeedsOcr(text.trim().length, pageImageCounts[index] ?? 0) ? index : -1)).filter((index) => index >= 0);

  let ocrText = new Map<number, string>();
  if (scannedPages.length > 0) {
    try {
      ocrText = await ocrPdfPages(buffer, scannedPages);
    } catch (error) {
      if (error instanceof PdfOcrError) throw new PdfTextExtractionError(error.message);
      throw error;
    }
  }

  const combined = pageTexts.map((text, index) => (ocrText.has(index) ? (ocrText.get(index) ?? "") : text)).join("\n\n");
  const text = combined.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (text.length < MIN_EXTRACTABLE_CHARS) {
    throw new PdfTextExtractionError(
      scannedPages.length > 0
        ? "No readable text was found in this PDF, even after scanning its pages. Check that the file isn't blank or heavily distorted."
        : "This PDF has no readable text."
    );
  }

  return { text, pageCount, ocrPageCount: scannedPages.length };
}

export type DetectedSectionMarker = { label: string; index: number; number: number };

const PASSAGE_MARKER_PATTERN = /^[ \t]*(?:READING\s+)?PASSAGE\s+(\d+)\b.*$/gim;
// IELTS Listening papers head their four parts "SECTION n" (Cambridge books) or "PART n" (the exam itself and many teacher-made papers) — both are the same four sections.
// The number may be a digit or a word (PART ONE) — scanned and hand-made papers use both.
const SECTION_MARKER_PATTERN = /^[ \t]*(?:LISTENING\s+)?(?:SECTION|PART)\s+(\d+|ONE|TWO|THREE|FOUR)\b.*$/gim;
const NUMBER_WORDS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4 };

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
  const allMatches = [...text.matchAll(pattern)];

  // An answer key repeats the part / passage headings ("SECTION 4  31 jewellery 32 minerals…"). Those are not where a section STARTS — taking one as a heading when the real one is missing turns the answer key into a section and has questions invented from its answers. Headings after the key are ignored (unless nothing before it is a heading at all, e.g. a key printed first).
  const keyStart = detectAnswerKeyStart(text);
  const beforeKey = keyStart != null ? allMatches.filter((match) => (match.index ?? 0) < keyStart) : allMatches;
  const matches = beforeKey.length > 0 ? beforeKey : allMatches;

  const firstByNumber = new Map<number, DetectedSectionMarker>();
  for (const match of matches) {
    const raw = match[1].toUpperCase();
    const num = NUMBER_WORDS[raw] ?? Number(raw);
    if (!Number.isFinite(num) || firstByNumber.has(num)) continue;
    // A Listening paper has exactly four parts; "Part 7" is something else (a heading inside the text).
    if (testType === "LISTENING" && (num < 1 || num > LISTENING_PART_COUNT)) continue;
    firstByNumber.set(num, { label: match[0].trim().replace(/\s+/g, " ").slice(0, 80), index: match.index ?? 0, number: num });
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
  const found = detectAllQuestionGroupHeadings(text);

  const seen = new Set<string>();
  const unique = found
    .sort((a, b) => a.index - b.index)
    .filter((m) => {
      const key = `${m.startNumber}-${m.endNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // A heading that spans smaller blocks printed after it ("Questions 1–13" then "1–5", "6–9", "10–13") is only a container. When the smaller blocks cover all of it the container is dropped; when they cover only part of it ("Questions 11–20" then "Questions 19 and 20") the container keeps the numbers they don't cover (11–18) — dropping it outright would silently lose those questions.
  const result: DetectedQuestionGroupMarker[] = [];
  unique.forEach((m, i) => {
    const inside = unique.slice(i + 1).filter((later) => later.startNumber >= m.startNumber && later.endNumber <= m.endNumber && (later.startNumber !== m.startNumber || later.endNumber !== m.endNumber));
    if (inside.length === 0) {
      result.push(m);
      return;
    }
    const covered = new Set<number>();
    for (const sub of inside) for (let n = sub.startNumber; n <= sub.endNumber; n++) covered.add(n);
    const uncovered: number[] = [];
    for (let n = m.startNumber; n <= m.endNumber; n++) if (!covered.has(n)) uncovered.push(n);
    const contiguous = uncovered.length > 0 && uncovered[uncovered.length - 1] - uncovered[0] === uncovered.length - 1;
    if (contiguous) result.push({ ...m, startNumber: uncovered[0], endNumber: uncovered[uncovered.length - 1], label: `Questions ${uncovered[0]}–${uncovered[uncovered.length - 1]}` });
  });
  return result;
}

/** Every real block heading in document order, repeats and containers included — the raw material detectQuestionGroupMarkers cleans up, and what a jumbled paper has to be reassembled from. */
export function detectAllQuestionGroupHeadings(text: string): DetectedQuestionGroupMarker[] {
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

  return found.sort((a, b) => a.index - b.index);
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

// ---------------------------------------------------------------------------
// Phase B — Listening papers. A real Listening paper is four parts of ten
// questions (1–10, 11–20, 21–30, 31–40), so the QUESTION NUMBERS say which part
// a block belongs to far more reliably than where its page happened to land:
// scanned and hand-assembled papers come with a missing "PART 2" heading,
// pages out of order, or the same page twice — and cutting the text at
// whatever headings were found then hands a block to the wrong part.
// ---------------------------------------------------------------------------

export type PlannedListeningSection = { label: string; text: string };
export type ListeningSegmentPlan = {
  /** "headings": the printed PART/SECTION headings agree with the question numbers, cut the text there. "question-ranges": they don't, so the text was reassembled by question number. */
  strategy: "headings" | "question-ranges";
  /** Only for "question-ranges": exactly four sections, in order, answer key excluded. */
  sections: PlannedListeningSection[];
  notes: string[];
};

export function planListeningSegments(text: string): ListeningSegmentPlan {
  const keyStart = detectAnswerKeyStart(text);
  const body = keyStart != null ? text.slice(0, keyStart) : text;
  const headings = detectSectionMarkers(text, "LISTENING");
  const notes: string[] = [];

  // 1. Do the printed headings and the question numbers agree?
  if (headings.length === LISTENING_PART_COUNT && headings.every((h, i) => h.number === i + 1)) {
    const segments = splitTextByMarkers(text, headings);
    const agree = segments.every((segment, i) => {
      const usable = i === LISTENING_PART_COUNT - 1 && keyStart != null ? segment.slice(0, Math.max(0, keyStart - headings[i].index)) : segment;
      return detectQuestionGroupMarkers(usable).every((block) => listeningPartOf(block.startNumber) === i + 1);
    });
    if (agree) return { strategy: "headings", sections: [], notes };
  }

  // 2. Reassemble by question number.
  const raw = detectAllQuestionGroupHeadings(body);
  if (raw.length === 0) return { strategy: "headings", sections: [], notes };

  type Candidate = { marker: DetectedQuestionGroupMarker; text: string };
  // The rebuilt text is re-read downstream, so each kept block carries a heading that states exactly the numbers it was kept for (a block trimmed from "31–36" to "35–36" must not still announce 31–36 and re-create the overlap).
  const withHeading = (candidate: Candidate, start: number, end: number): Candidate => {
    const firstLineEnd = candidate.text.indexOf("\n");
    const rest = firstLineEnd === -1 ? "" : candidate.text.slice(firstLineEnd);
    return { marker: { ...candidate.marker, startNumber: start, endNumber: end, label: `Questions ${start}–${end}` }, text: `Questions ${start}–${end}${rest}` };
  };
  const candidates: Candidate[] = raw.map((marker, i) => ({ marker, text: body.slice(marker.index, i + 1 < raw.length ? raw[i + 1].index : body.length) }));

  // The same block printed twice (a repeated page, a running header): keep the fuller copy.
  const byRange = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.marker.startNumber}-${candidate.marker.endNumber}`;
    const existing = byRange.get(key);
    if (!existing || candidate.text.length > existing.text.length) byRange.set(key, candidate);
  }

  // Blocks whose ranges overlap are competing versions of the same questions: the fuller one wins, but a container is trimmed down to the numbers its sub-blocks don't cover (so "Questions 11–20" followed by "Questions 19 and 20" still yields 11–18).
  const ordered = [...byRange.values()].sort((a, b) => a.marker.endNumber - a.marker.startNumber - (b.marker.endNumber - b.marker.startNumber) || a.marker.startNumber - b.marker.startNumber);
  const taken = new Set<number>();
  const kept: Candidate[] = [];
  for (const candidate of ordered) {
    const numbers: number[] = [];
    for (let n = candidate.marker.startNumber; n <= candidate.marker.endNumber; n++) if (!taken.has(n)) numbers.push(n);
    if (numbers.length === 0) continue;
    const contiguous = numbers[numbers.length - 1] - numbers[0] === numbers.length - 1;
    if (!contiguous) continue;
    kept.push(withHeading(candidate, numbers[0], numbers[numbers.length - 1]));
    for (const n of numbers) taken.add(n);
  }
  kept.sort((a, b) => a.marker.startNumber - b.marker.startNumber);

  const sections: PlannedListeningSection[] = [];
  for (let part = 1; part <= LISTENING_PART_COUNT; part++) {
    const blocks = kept.filter((candidate) => listeningPartOf(candidate.marker.startNumber) === part);
    const heading = headings.find((h) => h.number === part);
    const label = heading ? heading.label : `PART ${part}`;
    if (blocks.length > 0) {
      sections.push({ label, text: `${label}\n\n${blocks.map((block) => block.text.trim()).join("\n\n")}` });
    } else if (heading) {
      // No question block of its own was found for this part — hand the model what is printed under its heading (the whole-section reading path).
      const next = headings.find((h) => h.index > heading.index);
      sections.push({ label, text: body.slice(heading.index, Math.min(next?.index ?? body.length, body.length)) });
    } else {
      sections.push({ label, text: "" });
    }
  }

  notes.push(
    headings.length === LISTENING_PART_COUNT
      ? "The printed part headings don't match the question numbers (pages out of order or repeated), so the parts were rebuilt from the question ranges."
      : `Only ${headings.length} of the 4 part headings were found, so the parts were rebuilt from the question ranges.`
  );
  return { strategy: "question-ranges", sections, notes };
}
