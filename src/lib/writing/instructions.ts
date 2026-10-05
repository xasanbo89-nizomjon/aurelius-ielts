import { WRITING_PART_MINUTES, WRITING_PART_MIN_WORDS, type WritingTaskKey } from "@/lib/writing/constants";

/**
 * Phase J - the line in the part bar of the Writing screen:
 *
 *   Part 1   You should spend about 20 minutes on this task. Write at least 150 words.
 *
 * A task's wording often already carries those two sentences (a task typed from a Cambridge paper starts with "You
 * should spend about 20 minutes on this task." and ends with "Write at least 150 words."). When it does, they are the
 * STORED task instructions: they move to the part bar and are left out of the task text, so they are not shown twice.
 * When it does not, the part bar says the standard sentence for that task. Nothing else of the stored prompt is touched.
 */

const SPEND_LINE = /^[ \t]*You should spend (?:about|around|approximately) (\d{1,3}) minutes? on this task\.?[ \t]*(?:\r?\n|$)/i;
const WORDS_LINE = /(?:^|\r?\n)[ \t]*Write at least (\d{2,4}) words\.?[ \t]*$/i;

export type WritingInstructions = {
  /** The sentence(s) for the part bar. */
  line: string;
  /** The task text for the left pane, without the instruction sentences that were moved to the part bar. */
  body: string;
};

export function splitWritingInstructions(prompt: string, taskNumber: WritingTaskKey): WritingInstructions {
  let body = prompt;
  let minutes: number = WRITING_PART_MINUTES[taskNumber];
  let words: number = WRITING_PART_MIN_WORDS[taskNumber];

  const spend = SPEND_LINE.exec(body);
  if (spend) {
    minutes = Number(spend[1]);
    body = body.slice(spend[0].length);
  }
  const atLeast = WORDS_LINE.exec(body);
  if (atLeast) {
    words = Number(atLeast[1]);
    body = body.slice(0, atLeast.index);
  }

  // Never leave the student with an empty left pane: a prompt that was nothing but the two sentences stays whole.
  const cleaned = body.replace(/^\s+/, "").replace(/\s+$/, "");
  return {
    line: `You should spend about ${minutes} minutes on this task. Write at least ${words} words.`,
    body: cleaned.length > 0 ? cleaned : prompt,
  };
}
