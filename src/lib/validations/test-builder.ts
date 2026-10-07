import { z } from "zod";

import { CUSTOM_MAX_PARTS } from "@/lib/exam/test-format";

/**
 * Phase L2 - the shape of a test sent by the structured editor. Sizes are bounded so a request cannot be used to write an unreasonable amount, and no text
 * may hold a NUL character (Postgres text cannot store one). A DRAFT may be incomplete - a missing answer or an empty prompt is saved as it is; the
 * publish checks (validateTestForPublish) are what insist on a complete test.
 */
const text = (max: number) => z.string().max(max).refine((value) => !value.includes("\u0000"), "Text cannot contain a NUL character.");
const choice = z.object({ id: text(40), text: text(1000) });

const item = z.object({
  key: text(60),
  questionId: text(80).optional(),
  prompt: text(4000),
  choices: z.array(choice).max(12),
  correctChoiceIds: z.array(text(40)).max(12),
  tfng: z.enum(["", "TRUE", "FALSE", "NOT_GIVEN"]),
  answers: z.array(text(300)).max(24),
});

const GROUP_KINDS = [
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
] as const;

const group = z.object({
  key: text(60),
  groupId: text(80).optional(),
  questionId: text(80).optional(),
  kind: z.enum(GROUP_KINDS),
  instructions: text(4000),
  maxWords: z.number().int().positive().max(20).nullable(),
  wordBank: z.array(text(80)).max(30),
  allowMultiple: z.boolean(),
  /** Phase L3 - "choose TWO": how many letters each question of an allowMultiple group asks for. Absent in a payload from an older page: 2. */
  chooseCount: z.number().int().min(2).max(6).default(2),
  items: z.array(item).max(60),
  text: text(20000),
  blanks: z.array(z.array(text(300)).max(24)).max(60),
  prompts: z.array(choice).max(40),
  options: z.array(choice).max(30),
  matchAnswers: z.record(z.string().max(40), z.string().max(40)),
});

const part = z.object({
  key: text(60),
  passageId: text(80).optional(),
  title: text(160),
  content: text(60000),
  startSeconds: z.number().int().min(0).max(24 * 3600).nullable(),
  groups: z.array(group).max(40),
});

export const builderModelSchema = z.object({
  title: text(160),
  description: text(2000),
  durationMinutes: z.number().int().positive().max(300).nullable(),
  category: z.enum(["GENERAL", "CAMBRIDGE"]),
  /** Phase Q - absent in a payload from an older page: the format is left as it is. */
  format: z.enum(["FULL_IELTS", "CUSTOM"]).optional(),
  parts: z.array(part).max(CUSTOM_MAX_PARTS),
});

export const newTestSchema = z.object({
  type: z.enum(["READING", "LISTENING"]),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(160),
  description: z.string().trim().max(2000).optional(),
  durationMinutes: z.number().int().positive().max(300).nullable().optional(),
  category: z.enum(["GENERAL", "CAMBRIDGE"]).optional(),
  /** Phase Q - "Full IELTS" (40 questions, the default) or "Custom" (any number of questions); a Custom test starts with `partCount` empty parts. */
  format: z.enum(["FULL_IELTS", "CUSTOM"]).optional(),
  partCount: z.number().int().min(1).max(CUSTOM_MAX_PARTS).optional(),
});

/** The recording the browser says it uploaded; the server checks the URL is one of this teacher's own uploads. */
export const attachedAudioSchema = z.object({
  url: z.string().min(1).max(2048),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive(),
});
