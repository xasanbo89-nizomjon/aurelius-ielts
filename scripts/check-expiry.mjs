// Phase K - regression guard for the rules of the server-side clock. No database, no browser: the pure functions every screen, the lazy
// finalisation, the scheduled job and the repair scripts share.
//
//   npm run check:expiry
//
//   deadlines      Listening = recording + 2 min (Full Mock), Reading 60 min, an untimed section never expires, the grace before the server acts
//   time used      per section min(end - start, allowance); a Full Mock's total is the SUM of its sections (not capped at one section's length)
//   bands          Writing waits for the teacher's mark; the combined figure rounds to the nearest half band (6.25 -> 6.5, 6.75 -> 7.0, 6.125 -> 6.0)
//
// Exit code 1 if any check fails.
import assert from "node:assert/strict";

import {
  EXPIRY_GRACE_SECONDS,
  deadlineFrom,
  fullMockTimeUsed,
  isPastDeadline,
  secondsLeft,
  sectionAllowedSeconds,
  sectionTimeUsedSeconds,
  sumSectionSeconds,
  writingDeadline,
} from "@/lib/exam/section-deadline";
import { bandForSection, overallBandFromSections, overallBandLabel, requiredSectionsFor, writingProgressLabel } from "@/lib/full-mock-band-composition";

let passed = 0;
let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log("ok   ", name);
  } catch (error) {
    failed++;
    console.log("FAIL ", name, "\n     ", String(error?.message ?? error).split("\n").join("\n      "));
  }
};
const at = (iso) => new Date(iso);

// ---------------------------------------------------------------------------------------------------------------- deadlines
test("Full Mock Listening = the recording + 2 minutes of review", () => {
  assert.equal(sectionAllowedSeconds({ skill: "LISTENING", fullMock: true, durationMinutes: null, recordingSeconds: 1810 }), 1810 + 120);
  assert.equal(sectionAllowedSeconds({ skill: "LISTENING", fullMock: true, durationMinutes: 40, recordingSeconds: 1810.2 }), 1811 + 120, "a recording of 1810.2 s is rounded UP");
});
test("a Full Mock whose recording length is not known uses the old 40 + 2 minutes", () => {
  assert.equal(sectionAllowedSeconds({ skill: "LISTENING", fullMock: true, durationMinutes: null, recordingSeconds: null }), 42 * 60);
  assert.equal(sectionAllowedSeconds({ skill: "LISTENING", fullMock: true, durationMinutes: null, recordingSeconds: 0 }), 42 * 60);
});
test("Reading in a Full Mock is 60 minutes whatever the test says", () => {
  assert.equal(sectionAllowedSeconds({ skill: "READING", fullMock: true, durationMinutes: 45 }), 3600);
});
test("a standalone test uses its own duration; one with no duration is untimed and never expires", () => {
  assert.equal(sectionAllowedSeconds({ skill: "READING", fullMock: false, durationMinutes: 60 }), 3600);
  assert.equal(sectionAllowedSeconds({ skill: "READING", fullMock: false, durationMinutes: null }), null);
  assert.equal(sectionAllowedSeconds({ skill: "LISTENING", fullMock: false, durationMinutes: null, recordingSeconds: 1800 }), null);
  assert.equal(deadlineFrom(at("2026-01-01T10:00:00Z"), null), null);
  assert.equal(isPastDeadline(null, at("2099-01-01T00:00:00Z"), 0), false);
  assert.equal(secondsLeft(null, Date.now()), null);
});
test("the deadline is start + allowance; Writing is start + 60 minutes", () => {
  assert.equal(deadlineFrom(at("2026-01-01T10:00:00Z"), 125).toISOString(), "2026-01-01T10:02:05.000Z");
  assert.equal(writingDeadline(at("2026-01-01T10:00:00Z")).toISOString(), "2026-01-01T11:00:00.000Z");
});
test("the server waits out a grace (90 s) before acting, so the browser's own hand-in wins", () => {
  const deadline = at("2026-01-01T11:00:00Z");
  assert.equal(EXPIRY_GRACE_SECONDS, 90);
  assert.equal(isPastDeadline(deadline, at("2026-01-01T11:00:30Z"), EXPIRY_GRACE_SECONDS), false);
  assert.equal(isPastDeadline(deadline, at("2026-01-01T11:01:29Z"), EXPIRY_GRACE_SECONDS), false);
  assert.equal(isPastDeadline(deadline, at("2026-01-01T11:01:30Z"), EXPIRY_GRACE_SECONDS), true);
  assert.equal(isPastDeadline(deadline, at("2026-01-01T11:00:00Z"), 0), true);
});
test("seconds left never goes negative", () => {
  assert.equal(secondsLeft(at("2026-01-01T11:00:00Z"), at("2026-01-01T10:59:00Z")), 60);
  assert.equal(secondsLeft(at("2026-01-01T11:00:00Z"), at("2026-01-01T12:00:00Z")), 0);
});

// ---------------------------------------------------------------------------------------------------------------- time used
test("time used is the real time, capped at what the section allowed", () => {
  const start = at("2026-01-01T10:00:00Z");
  assert.equal(sectionTimeUsedSeconds({ startedAt: start, endedAt: at("2026-01-01T10:25:30Z"), allowedSeconds: 3600 }), 1530);
  assert.equal(sectionTimeUsedSeconds({ startedAt: start, endedAt: at("2026-01-01T12:00:00Z"), allowedSeconds: 3600 }), 3600, "left open for two hours = 60 minutes");
  assert.equal(sectionTimeUsedSeconds({ startedAt: start, endedAt: at("2026-01-01T12:00:00Z"), allowedSeconds: null }), 7200, "untimed: the real time");
  assert.equal(sectionTimeUsedSeconds({ startedAt: null, endedAt: start, allowedSeconds: 3600 }), 0);
});
test("a Full Mock's total is the SUM of its sections - not capped at 42 minutes", () => {
  const t = fullMockTimeUsed({ listeningSeconds: 1900, readingSeconds: 3400, hasWriting: true, writingStartedAt: at("2026-01-01T12:00:00Z"), writingEndedAt: at("2026-01-01T12:41:00Z") });
  assert.deepEqual(t, { listening: 1900, reading: 3400, writing: 2460, total: 1900 + 3400 + 2460 });
  assert.ok(t.total > 42 * 60);
});
test("Writing time is capped at the hour, and the total is unknown until every section has ended", () => {
  const capped = fullMockTimeUsed({ listeningSeconds: 100, readingSeconds: 200, hasWriting: true, writingStartedAt: at("2026-01-01T12:00:00Z"), writingEndedAt: at("2026-01-01T16:00:00Z") });
  assert.equal(capped.writing, 3600);
  assert.equal(fullMockTimeUsed({ listeningSeconds: 100, readingSeconds: 200, hasWriting: true, writingStartedAt: at("2026-01-01T12:00:00Z"), writingEndedAt: null }).total, null);
  assert.equal(fullMockTimeUsed({ listeningSeconds: 100, readingSeconds: null, hasWriting: false, writingStartedAt: null, writingEndedAt: null }).total, null);
  assert.equal(fullMockTimeUsed({ listeningSeconds: 100, readingSeconds: 200, hasWriting: false, writingStartedAt: null, writingEndedAt: null }).total, 300, "a mock without Writing needs no Writing time");
  assert.equal(sumSectionSeconds([10, null, 5.4, undefined]), 15);
});

// ---------------------------------------------------------------------------------------------------------------- bands
const rows = (l, r, w, speaking) => [
  { section: "LISTENING", result: { bandScore: l }, writingSubmission: null, speakingSubmission: null },
  { section: "READING", result: { bandScore: r }, writingSubmission: null, speakingSubmission: null },
  { section: "WRITING", result: null, writingSubmission: { bandScore: w, taskType: "Task 1" }, speakingSubmission: null },
  { section: "WRITING", result: null, writingSubmission: { bandScore: w, taskType: "Task 2" }, speakingSubmission: null },
  ...(speaking != null ? [{ section: "SPEAKING", result: null, writingSubmission: null, speakingSubmission: { bandScore: speaking } }] : []),
];
const four = requiredSectionsFor({ writingSectionCount: 2, speakingSectionCount: 1 });
const three = requiredSectionsFor({ writingSectionCount: 2, speakingSectionCount: 0 });
test("the combined figure rounds to the nearest half band: 6.25 -> 6.5, 6.75 -> 7.0, 6.125 -> 6.0", () => {
  assert.equal(overallBandFromSections(rows(6.5, 6.5, 6, 6), four), 6.5, "6.25");
  assert.equal(overallBandFromSections(rows(7, 6.5, 7, 6.5), four), 7.0, "6.75");
  assert.equal(overallBandFromSections(rows(6.5, 6, 6, 6), four), 6.0, "6.125");
  assert.equal(overallBandFromSections(rows(6.5, 6, 6), three), 6.0, "6.1667");
  assert.equal(overallBandFromSections(rows(7, 7, 6.5), three), 7.0, "6.8333");
  assert.equal(overallBandFromSections(rows(6.5, 6.5, 6.5), three), 6.5, "6.5 stays 6.5");
});
test("Writing is the teacher's mark only: no mark, no Writing band and no combined figure", () => {
  assert.equal(bandForSection(rows(7, 7, null), "WRITING"), null);
  assert.equal(overallBandFromSections(rows(7, 7, null), three), null);
  const aiOnly = [{ section: "WRITING", result: null, writingSubmission: { bandScore: null, taskType: "Task 1", analysis: { estimatedBand: 9 } }, speakingSubmission: null }];
  assert.equal(bandForSection(aiOnly, "WRITING"), null, "the AI estimate never stands in for the teacher's mark");
});
test("Writing band = (Task 1 + 2 x Task 2) / 3 rounded to a half band", () => {
  const split = [
    { section: "WRITING", result: null, writingSubmission: { bandScore: 6, taskType: "Task 1" }, speakingSubmission: null },
    { section: "WRITING", result: null, writingSubmission: { bandScore: 7, taskType: "Task 2" }, speakingSubmission: null },
  ];
  assert.equal(bandForSection(split, "WRITING"), 6.5, "(6 + 14) / 3 = 6.67");
});
test("the combined figure says which skills it is made of and that it is unofficial", () => {
  assert.equal(overallBandLabel(three), "Overall (L/R/W, unofficial)");
  assert.equal(overallBandLabel(four), "Overall (L/R/W/S, unofficial)");
});
test("the Writing status words a teacher sees", () => {
  const sub = (status, band) => ({ section: "WRITING", writingSubmission: { status, bandScore: band } });
  assert.equal(writingProgressLabel({ taskCount: 0, started: false, rows: [] }), null);
  assert.equal(writingProgressLabel({ taskCount: 2, started: false, rows: [] }), "Not started");
  assert.equal(writingProgressLabel({ taskCount: 2, started: true, rows: [] }), "In progress");
  assert.equal(writingProgressLabel({ taskCount: 2, started: true, rows: [sub("SUBMITTED", null)] }), "1 of 2 tasks submitted");
  assert.equal(writingProgressLabel({ taskCount: 2, started: true, rows: [sub("SUBMITTED", null), sub("SUBMITTED", null)] }), "Submitted — awaiting teacher review");
  assert.equal(writingProgressLabel({ taskCount: 2, started: true, rows: [sub("REVIEWED", 6), sub("REVIEWED", 7)] }), "Graded");
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
