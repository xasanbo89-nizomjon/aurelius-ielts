import type { WritingTaskCategory, WritingTaskNumber, WritingTrainingType } from "@prisma/client";

/**
 * Phase A — turns the text of an IELTS Writing paper PDF into its Task 1 and
 * Task 2. Deterministic on purpose (same principle as the passage / question
 * -block detection in pdf-text-extraction.ts): a Writing paper prints each
 * task under a "WRITING TASK 1" / "WRITING TASK 2" heading, so the split is
 * something a regex can do exactly, and the prompt a teacher wants is the
 * paper's own wording verbatim — not an AI paraphrase of it. Pure (no I/O) so
 * it can be tested and reused by the client-safe parts of the builder.
 */

export type ParsedWritingTask = {
  taskNumber: WritingTaskNumber;
  trainingType: WritingTrainingType;
  category: WritingTaskCategory;
  title: string;
  prompt: string;
  /** Anything the paper prints that describes the visual (axis labels, table headings…) — the picture itself can't be read from a PDF, so the teacher attaches it in the builder. */
  visualDescription?: string;
};

export type WritingPdfParseResult = { tasks: ParsedWritingTask[]; problems: string[] };

const TASK_MARKER = /^[ \t]*(?:IELTS[ \t]+)?(?:WRITING[ \t]+)?TASK[ \t]+([12])\b[^\n]*$/gim;
const MAX_PROMPT_CHARS = 2000;
const MAX_VISUAL_CHARS = 2000;
const MIN_PROMPT_CHARS = 10;

/** Task 1 (Academic): graph / table / process / map. Task 2: the four essay types the platform's categories name. Falls back to the most common type when the wording doesn't decide it. */
export function inferWritingCategory(taskNumber: WritingTaskNumber, prompt: string): WritingTaskCategory {
  const text = prompt.toLowerCase();

  if (taskNumber === "TASK_1") {
    if (/\b(map|maps|plan|plans|layout)\b/.test(text)) return "MAP";
    if (/\b(process|stages|steps|how\b.*\b(made|produced|works?)|cycle|life ?cycle)\b/.test(text)) return "PROCESS";
    if (/\btable\b/.test(text)) return "TABLE";
    return "GRAPH";
  }

  if (/advantages?\b.*\bdisadvantages?|disadvantages?\b.*\badvantages?|outweigh|positive or negative|positive development|negative development/.test(text)) return "ADVANTAGES_DISADVANTAGES";
  if (/\b(problems?|causes?|issues?)\b.*\b(solutions?|measures?|solve|tackle)\b|\b(solutions?|measures?)\b.*\b(problems?|causes?)\b/.test(text)) return "PROBLEM_SOLUTION";
  if (/discuss both|both (these )?views|both sides|discuss (the )?(two )?(views|opinions)/.test(text)) return "DISCUSSION";
  return "OPINION";
}

/** A General Training Task 1 is a letter; everything else is treated as Academic. */
export function inferTrainingType(taskNumber: WritingTaskNumber, prompt: string): WritingTrainingType {
  if (taskNumber === "TASK_1" && /\bwrite a letter\b|\bin your letter\b|\bdear (sir|madam|mr|ms)\b/i.test(prompt)) return "GENERAL";
  return "ACADEMIC";
}

function cleanPrompt(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseWritingTasksFromText(text: string, mockTitle?: string): WritingPdfParseResult {
  const problems: string[] = [];
  TASK_MARKER.lastIndex = 0;

  // First occurrence of each task number only — a paper may repeat a "WRITING TASK 1" running header on later pages.
  const firstByNumber = new Map<number, { index: number; end: number }>();
  for (const match of text.matchAll(TASK_MARKER)) {
    const n = Number(match[1]);
    if (!firstByNumber.has(n)) firstByNumber.set(n, { index: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }

  if (!firstByNumber.has(1) || !firstByNumber.has(2)) {
    const missing = [1, 2].filter((n) => !firstByNumber.has(n)).map((n) => `Task ${n}`);
    problems.push(`Couldn't find ${missing.join(" and ")} in this PDF. Each task should start under a heading like "WRITING TASK ${missing[0]?.slice(-1) ?? "1"}".`);
    return { tasks: [], problems };
  }

  const ordered = [...firstByNumber.entries()].sort((a, b) => a[1].index - b[1].index);
  const tasks: ParsedWritingTask[] = [];

  ordered.forEach(([number, marker], position) => {
    if (number !== 1 && number !== 2) return;
    const nextStart = position + 1 < ordered.length ? ordered[position + 1][1].index : text.length;
    const body = cleanPrompt(text.slice(marker.end, nextStart));
    const taskNumber: WritingTaskNumber = number === 1 ? "TASK_1" : "TASK_2";

    if (body.length < MIN_PROMPT_CHARS) {
      problems.push(`Task ${number} has no text under its heading.`);
      return;
    }

    let prompt = body;
    let visualDescription: string | undefined;

    if (prompt.length > MAX_PROMPT_CHARS) {
      // Keep the instruction (the first paragraphs) as the prompt; the long tail is usually the chart's own data/labels.
      const cut = prompt.lastIndexOf("\n", MAX_PROMPT_CHARS);
      const split = cut > MIN_PROMPT_CHARS ? cut : MAX_PROMPT_CHARS;
      visualDescription = prompt.slice(split).trim().slice(0, MAX_VISUAL_CHARS) || undefined;
      prompt = prompt.slice(0, split).trim();
    }

    tasks.push({
      taskNumber,
      trainingType: inferTrainingType(taskNumber, prompt),
      category: inferWritingCategory(taskNumber, prompt),
      title: `${mockTitle ? `${mockTitle} — ` : ""}Writing Task ${number}`.slice(0, 160),
      prompt,
      visualDescription,
    });
  });

  tasks.sort((a, b) => (a.taskNumber === b.taskNumber ? 0 : a.taskNumber === "TASK_1" ? -1 : 1));
  if (tasks.length < 2 && problems.length === 0) problems.push("Both Writing Task 1 and Task 2 are needed.");
  return { tasks: problems.length > 0 ? [] : tasks, problems };
}
