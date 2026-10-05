/**
 * Phase J - THE word counter of the Writing test. One function, used by the exam screen (the live "Word count: N")
 * AND by the server (the count stored with every saved draft and with the handed-in essay), so the number a student
 * sees under the box is the number the teacher gets.
 *
 * The rule:
 *  - a word is any run of characters between whitespace (spaces, tabs, line breaks, non-breaking spaces);
 *  - empty pieces are ignored, so extra spaces and blank lines add nothing;
 *  - a hyphenated word ("well-known") is ONE word, because there is no whitespace inside it;
 *  - a number counts as a word ("2015" is one word), and so does a lone symbol standing between spaces ("&", "-").
 *
 * Pure and client-safe on purpose: nothing here may ever read the clock, the DOM or the database.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const piece of text.split(/\s+/)) {
    if (piece.length > 0) count += 1;
  }
  return count;
}
