// Phase Q - proof of the exam fixes (Part A) and of the Speaking assessment rules (Part B), with no database and no network.
//
//   npm run check:q
//
//   A1  the clock: minutes AND seconds the whole way ("59:32 left"), the warning style in the last ten minutes, the Listening review countdown in the same form
//   A2  matching: when a heading / letter may be used for more than one question (the task's own words), so the screen knows when a used one leaves the list
//   (A3, A4 and Part B add their own checks below as they are built)
import assert from "node:assert/strict";

import { timeLeftText, WARNING_SECONDS } from "@/components/exam/official/official-header";
import { reviewCountdownText } from "@/lib/exam/listening-audio";
import { matchingAllowsReuse } from "@/lib/exam/question-groups";
import { UPLOAD_ATTEMPTS, UPLOAD_STALL_SECONDS, describeUploadFailure, formatBytes, formatSpeed, isRetryableStatus, retryDelayMs } from "@/lib/uploads/upload-policy";
import { FULL_IELTS_QUESTIONS, canBeBanded, canJoinFullMock, expectedQuestionCount, formatBadge, formatOf, percentOf, readScore } from "@/lib/exam/test-format";
import { validateTestStructure } from "@/lib/exam/test-validation";
import { validateImportedTest } from "@/lib/exam/pdf-import-validation";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log("ok   ", name);
  } catch (error) {
    failed++;
    console.log("FAIL ", name, "\n     ", String(error?.stack ?? error).split("\n").slice(0, 6).join("\n      "));
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------- A1
await check("A1 the clock reads minutes AND seconds from the first second: 59:32 left", () => {
  assert.equal(timeLeftText(59 * 60 + 32).text, "59:32 left");
  assert.equal(timeLeftText(60 * 60).text, "60:00 left");
  assert.equal(timeLeftText(45 * 60 + 5).text, "45:05 left", "seconds are always two digits");
  assert.equal(timeLeftText(0).text, "0:00 left");
  assert.equal(timeLeftText(120 * 60).text, "120:00 left", "a long test keeps counting minutes");
});

await check("A1 the warning style starts with the last ten minutes and not before", () => {
  assert.equal(WARNING_SECONDS, 600);
  assert.equal(timeLeftText(601).warning, false);
  assert.equal(timeLeftText(600).warning, true);
  assert.equal(timeLeftText(599).text, "9:59 left");
  assert.equal(timeLeftText(599).warning, true);
  assert.equal(timeLeftText(1).warning, true);
});

await check("A1 a screen reader gets the time in words", () => {
  assert.equal(timeLeftText(59 * 60 + 32).spoken, "59 minutes 32 seconds left");
  assert.equal(timeLeftText(61).spoken, "1 minute 1 second left");
});

await check("A1 the Listening review countdown has the same form (warning in the last minute)", () => {
  assert.deepEqual(reviewCountdownText(120), { text: "2:00 left to check your answers", warning: false });
  assert.deepEqual(reviewCountdownText(119), { text: "1:59 left to check your answers", warning: false });
  assert.deepEqual(reviewCountdownText(61), { text: "1:01 left to check your answers", warning: false });
  assert.deepEqual(reviewCountdownText(60), { text: "1:00 left to check your answers", warning: true });
  assert.deepEqual(reviewCountdownText(5), { text: "0:05 left to check your answers", warning: true });
  assert.deepEqual(reviewCountdownText(-3), { text: "0:00 left to check your answers", warning: true });
});

// ---------------------------------------------------------------------------------------------------------------------------------------------- A2
await check("A2 a heading list is used once: the task says so, or says nothing", () => {
  const headings = "Choose the correct heading for each paragraph from the list of headings below.";
  assert.equal(matchingAllowsReuse(headings, 5, 8), false, "more headings than paragraphs, nothing said: once");
  assert.equal(matchingAllowsReuse("Each heading may be used only once.", 5, 8), false);
  assert.equal(matchingAllowsReuse("Use each letter once only.", 4, 6), false);
  assert.equal(matchingAllowsReuse("Do not use any letter more than once.", 4, 6), false, "a NOT before 'more than once' is a once-only task");
  assert.equal(matchingAllowsReuse("You may NOT use any heading more than once.", 5, 8), false);
  assert.equal(matchingAllowsReuse(null, 5, 8), false);
  assert.equal(matchingAllowsReuse("", 5, 5), false);
});

await check("A2 a letter list may be reused when the task says so, and always when there are more questions than options", () => {
  assert.equal(matchingAllowsReuse("Match each statement with the correct person, A-E. NB You may use any letter more than once.", 6, 5), true);
  assert.equal(matchingAllowsReuse("Match each statement with the correct option, A-E. You may use any letter more than once.", 5, 7), true, "the task says so, even with spare options");
  assert.equal(matchingAllowsReuse("Choose the correct heading.", 7, 5), true, "7 questions and 5 headings: one must be used twice - never hide an option the student still needs");
  assert.equal(matchingAllowsReuse("Each heading may be used only once.", 7, 5), true, "contradictory data: showing everything beats an unanswerable question");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------- A3 uploads
await check("A3 an upload is tried 3 times, with a pause before the 2nd and 3rd, and gives up after a stall of 45 s", () => {
  assert.equal(UPLOAD_ATTEMPTS, 3);
  assert.equal(UPLOAD_STALL_SECONDS, 45);
  assert.deepEqual([1, 2, 3].map(retryDelayMs), [0, 2000, 6000]);
});

await check("A3 only a failure that can pass again is retried: no connection, a stall, a busy or broken server - never a refusal", () => {
  for (const status of [0, 408, 425, 429, 500, 502, 503, 504]) assert.equal(isRetryableStatus(status), true, String(status));
  for (const status of [200, 400, 401, 403, 404, 409, 413, 422]) assert.equal(isRetryableStatus(status), false, String(status));
});

await check("A3 every failure is one plain sentence for the teacher", () => {
  assert.match(describeUploadFailure("stall"), /no data moved for 45 seconds/);
  assert.match(describeUploadFailure("network"), /connection was lost/);
  assert.match(describeUploadFailure("http", 413), /too large/);
  assert.match(describeUploadFailure("http", 403), /refused or has expired/);
  assert.match(describeUploadFailure("http", 503), /HTTP 503/);
  assert.match(describeUploadFailure("http", 422, "bad thing"), /HTTP 422.*bad thing/);
  assert.equal(describeUploadFailure("cancelled"), "The upload was cancelled.");
});

await check("A3 sizes and speed read well", () => {
  assert.equal(formatBytes(45 * 1024 * 1024), "45.0 MB");
  assert.equal(formatBytes(300 * 1024), "300 KB");
  assert.equal(formatSpeed(1.5 * 1024 * 1024), "1.5 MB/s");
  assert.equal(formatSpeed(null), null);
  assert.equal(formatSpeed(0), null);
});

// ---------------------------------------------------------------------------------------------------------------------------------------------- A4 test formats
/** A test of `parts.length` parts holding `parts[i]` short-answer questions each, every one with an answer: the validator's input, as stored. */
function paper({ type = "LISTENING", format, parts, audio = true, title = "B2 Listening Practice" }) {
  const partRows = parts.map((_, i) => ({ id: `part${i}`, title: `Part ${i + 1}`, content: type === "READING" ? "A passage of text that is long enough to count as text. ".repeat(2) : "", audioSrc: audio ? "https://x/audio.mp3" : null, audioDurationSeconds: audio ? 600 : null }));
  const groups = [];
  const questions = [];
  let number = 1;
  let order = 0;
  parts.forEach((count, i) => {
    if (count === 0) return;
    groups.push({ id: `g${i}`, partId: `part${i}`, instructions: "Write ONE WORD for each answer.", startQuestion: number, endQuestion: number + count - 1 });
    for (let k = 0; k < count; k++) questions.push({ id: `q${order}`, partId: `part${i}`, groupId: `g${i}`, type: "SHORT_ANSWER", prompt: `Question ${number + k}?`, options: {}, correctAnswer: "word", order: order++ });
    number += count;
  });
  return { type, format, title, parts: partRows, groups, questions };
}

await check("A4 formats: nothing stored means Full IELTS; only a Custom test is not banded and cannot join a Full Mock", () => {
  assert.equal(formatOf(null), "FULL_IELTS");
  assert.equal(formatOf(undefined), "FULL_IELTS");
  assert.equal(formatOf("FULL_IELTS"), "FULL_IELTS");
  assert.equal(formatOf("CUSTOM"), "CUSTOM");
  assert.equal(canBeBanded(null), true);
  assert.equal(canBeBanded("CUSTOM"), false);
  assert.equal(canJoinFullMock(null), true);
  assert.equal(canJoinFullMock("CUSTOM"), false);
  assert.equal(expectedQuestionCount(null, 37), 40, "a Full IELTS test is expected to hold 40 whatever it holds now");
  assert.equal(expectedQuestionCount("CUSTOM", 24), 24, "a Custom test is expected to hold what it holds");
  assert.equal(FULL_IELTS_QUESTIONS, 40);
});

await check("A4 results: a Custom test reads 18/24 (75%) with no band; a Full IELTS test reads its band", () => {
  assert.deepEqual(readScore({ format: "CUSTOM", band: 5, rawScore: 18, totalPoints: 24 }), { kind: "score", band: null, text: "18/24 (75%)", percent: 75 }, "even a stored band is not shown for a Custom test");
  assert.equal(readScore({ format: "CUSTOM", band: null, rawScore: 0, totalPoints: 24 }).text, "0/24 (0%)");
  assert.equal(readScore({ format: null, band: 6.5, rawScore: 27, totalPoints: 40 }).text, "6.5");
  assert.equal(readScore({ format: "FULL_IELTS", band: null, rawScore: 0, totalPoints: 40 }).text, "—");
  assert.equal(percentOf(18, 24), 75);
  assert.equal(percentOf(1, 3), 33);
  assert.equal(percentOf(5, 0), null);
  assert.equal(formatBadge("CUSTOM", 24), "Custom · 24 questions");
  assert.equal(formatBadge(null, 40), "Full IELTS · 40 questions");
});

await check("A4 publish rules: a Full IELTS test still needs exactly 40 questions and the official parts", () => {
  const full40 = validateTestStructure(paper({ format: "FULL_IELTS", parts: [10, 10, 10, 10] }));
  assert.equal(full40.ok, true, JSON.stringify(full40.issues));
  assert.equal(full40.total, 40);
  const noFormat = validateTestStructure(paper({ parts: [10, 10, 10, 10] }));
  assert.equal(noFormat.ok, true, "a test with no stored format is a Full IELTS test");
  const full24 = validateTestStructure(paper({ format: "FULL_IELTS", parts: [6, 6, 6, 6] }));
  assert.equal(full24.ok, false);
  assert.ok(full24.issues.some((i) => i.code === "TOTAL" && /exactly 40/.test(i.message)), "24 questions is not a Full IELTS test");
  const full3parts = validateTestStructure(paper({ format: "FULL_IELTS", parts: [14, 13, 13] }));
  assert.ok(full3parts.issues.some((i) => i.code === "PART_COUNT"), "a Full Listening test has 4 parts");
});

await check("A4 publish rules: a Custom test may hold any number of questions and parts, numbered 1..N straight through", () => {
  const custom24 = validateTestStructure(paper({ format: "CUSTOM", parts: [6, 6, 6, 6] }));
  assert.equal(custom24.ok, true, JSON.stringify(custom24.issues));
  assert.equal(custom24.total, 24);
  assert.deepEqual(custom24.parts.map((p) => [p.first, p.last, p.count]), [[1, 6, 6], [7, 12, 6], [13, 18, 6], [19, 24, 6]], "part ranges come from the questions");
  const unevenParts = validateTestStructure(paper({ format: "CUSTOM", parts: [3, 11] }));
  assert.equal(unevenParts.ok, true, "two parts of 3 and 11 questions: no 'section 2 must hold 11-20' rule");
  assert.deepEqual(unevenParts.parts.map((p) => [p.first, p.last]), [[1, 3], [4, 14]]);
  assert.equal(validateTestStructure(paper({ format: "CUSTOM", parts: [1] })).ok, true, "one part, one question");
  assert.equal(validateTestStructure(paper({ format: "CUSTOM", type: "READING", parts: [7, 5, 4, 3, 2] })).ok, true, "five passages");
  const none = validateTestStructure(paper({ format: "CUSTOM", parts: [0] }));
  assert.ok(none.issues.some((i) => i.code === "TOTAL" && /at least 1/.test(i.message)), "no questions at all is not a test");
  const tooMany = validateTestStructure(paper({ format: "CUSTOM", parts: Array.from({ length: 13 }, () => 1) }));
  assert.ok(tooMany.issues.some((i) => i.code === "PART_COUNT" && /at most 12/.test(i.message)));
  const emptyPart = validateTestStructure(paper({ format: "CUSTOM", parts: [5, 0, 5] }));
  assert.ok(emptyPart.issues.some((i) => i.code === "PART_QUESTIONS"), "a part with no questions still has to be removed or filled");
});

await check("A4 publish rules: everything else still applies to a Custom test (an answer for every question, a recording for every Listening part)", () => {
  const noAudio = validateTestStructure(paper({ format: "CUSTOM", parts: [6, 6], audio: false }));
  assert.ok(noAudio.issues.some((i) => i.code === "PART_AUDIO"));
  const base = paper({ format: "CUSTOM", parts: [6, 6] });
  const noAnswer = { ...base, questions: base.questions.map((q, i) => (i === 3 ? { ...q, correctAnswer: "" } : q)) };
  const result = validateTestStructure(noAnswer);
  assert.ok(result.issues.some((i) => i.code === "ANSWER_MISSING"), JSON.stringify(result.issues.map((i) => i.code)));
  assert.equal(result.ok, false);
});

/** A staged Listening import: `sections.length` sections holding that many questions each, numbered straight on. */
function importOf(sections, { first = 1 } = {}) {
  let number = first;
  const answers = [];
  const passages = sections.map((count, i) => {
    const start = number;
    const items = Array.from({ length: count }, (_, k) => ({ number: start + k, prompt: `Question ${start + k}`, choices: [] }));
    items.forEach((item) => answers.push(item.number));
    number += count;
    return { id: `s${i}`, title: `Part ${i + 1}`, questionGroups: [{ id: `grp${i}`, startNumber: start, endNumber: number - 1, questionType: "SHORT_ANSWER", questionsJson: { summaryText: null, wordBank: [], maxWords: 2, matchingPrompts: [], matchingOptions: [], items } }] };
  });
  return { passages, answers };
}

await check("A4 PDF import: 24 questions in 4 sections is not blocked - the Full IELTS check says so and offers a Custom test of 24 questions", () => {
  const { passages, answers } = importOf([6, 6, 6, 6]);
  const asFull = validateImportedTest(passages, answers, { sectionLabel: "Section", listeningStructure: true });
  assert.equal(asFull.ok, false, "as a Full IELTS Listening test it is incomplete");
  assert.ok(asFull.issues.some((i) => i.code === "INCOMPLETE_LISTENING"));
  assert.deepEqual(asFull.suggestCustom, { questions: 24 }, "the way out: import it as a Custom test of 24 questions");
  assert.equal(asFull.format, "FULL_IELTS");
  const asCustom = validateImportedTest(passages, answers, { sectionLabel: "Section", listeningStructure: false, custom: true });
  assert.equal(asCustom.ok, true, JSON.stringify(asCustom.issues));
  assert.equal(asCustom.totalQuestions, 24);
  assert.equal(asCustom.format, "CUSTOM");
  assert.equal(asCustom.suggestCustom, null);
  assert.match(asCustom.notes.join(" "), /Custom test: 24 questions in 4 sections, numbered 1–24/);
});

await check("A4 PDF import: a Custom import is still checked - starts at 1, no gaps, every question has an answer, no duplicates", () => {
  const late = importOf([6, 6], { first: 3 });
  const lateResult = validateImportedTest(late.passages, late.answers, { sectionLabel: "Section", custom: true });
  assert.ok(lateResult.issues.some((i) => i.code === "CUSTOM_NUMBERING"), "numbering must start at 1");
  const gap = importOf([6, 6]);
  const withGap = gap.passages.map((p, i) => (i === 0 ? { ...p, questionGroups: [{ ...p.questionGroups[0], questionsJson: { ...p.questionGroups[0].questionsJson, items: p.questionGroups[0].questionsJson.items.filter((item) => item.number !== 4) } }] } : p));
  const gapResult = validateImportedTest(withGap, gap.answers.filter((n) => n !== 4), { sectionLabel: "Section", custom: true });
  assert.equal(gapResult.ok, false);
  assert.ok(gapResult.issues.some((i) => i.code === "MISSING_QUESTION"), "question 4 is missing from the middle");
  const keyless = importOf([4, 4]);
  const noKey = validateImportedTest(keyless.passages, keyless.answers.filter((n) => n !== 6), { sectionLabel: "Section", custom: true });
  assert.ok(noKey.issues.some((i) => i.code === "QUESTION_WITHOUT_ANSWER" || i.code === "COUNT_MISMATCH"));
});

await check("A4 PDF import: a complete 40-question Listening import is a Full IELTS test as before, with nothing to suggest", () => {
  const { passages, answers } = importOf([10, 10, 10, 10]);
  const result = validateImportedTest(passages, answers, { sectionLabel: "Section", listeningStructure: true });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.suggestCustom, null);
  assert.equal(result.format, "FULL_IELTS");
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
