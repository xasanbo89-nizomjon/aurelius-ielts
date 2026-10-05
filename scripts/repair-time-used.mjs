// Phase G0 / K — repairs "Time Used" on attempts submitted before it was capped (an attempt left open for 109 minutes on a 60-minute test
// was stored as 109 minutes; a Full Mock total was cut at one section's length).
//
//   npm run attempts:repair-time                         DRY RUN — lists every row whose stored value differs from what it should be
//   npm run attempts:repair-time -- --apply              writes the corrected values
//   npm run attempts:repair-time -- --title-prefix=_zz   only tests / mocks whose title starts with that text (for a rehearsal on test data)
//
// The corrected value is computed only from the row's own stored start and end, never invented:
//   Reading / Listening attempt:  min(end − start, the time its section allowed)
//       standalone timed test → the test's own duration; untimed → end − start
//       Full Mock Reading → 60 min;  Full Mock Listening → the recording's stored length + 2 min (the old 42 min while the length is not stored -
//       run `npm run audio:measure` first)       (an attempt that has a stored server deadline uses that deadline's length)
//   Full Mock Writing:  a sitting finished before Phase K has no recorded end for its Writing paper; the hand-in time of its last essay becomes
//       FullMockAttempt.writingEndedAt, so its Writing time is min(end − start, 60 min). Only filled where it is empty.
// The Full Mock TOTAL is not stored: it is always the sum of its sections, so correcting the sections corrects it.
// Only Result.durationSeconds and an empty FullMockAttempt.writingEndedAt change. Scores, bands, answers and highlights are not touched. Safe to run again.
import { PrismaClient } from "@prisma/client";

import { ensureRecordingLengths } from "@/lib/exam/recording-length";
import { sectionAllowedSeconds } from "@/lib/exam/section-deadline";
import { timeUsedSeconds } from "@/lib/exam/timing";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const prefixArg = args.find((arg) => arg.startsWith("--title-prefix"));
const prefix = prefixArg ? prefixArg.slice(prefixArg.indexOf("=") + 1) : null;
if (prefixArg && !prefix) {
  console.error("--title-prefix needs a value (e.g. --title-prefix=_zz). An empty prefix would match everything - refusing to run.");
  process.exit(1);
}

const db = new PrismaClient();
const inScope = (title) => !prefix || title.startsWith(prefix); // matched here: a title filter in the query would treat "_" as a wildcard
const fmt = (seconds) => (seconds == null ? "—" : seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m` : `${Math.round(seconds / 60)}m ${seconds % 60}s`);
const fmtDate = (date) => date.toISOString().replace("T", " ").slice(0, 16) + "Z";

try {
  const results = (
    await db.result.findMany({
      where: { completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        skill: true,
        startedAt: true,
        completedAt: true,
        deadlineAt: true,
        durationSeconds: true,
        mockTestId: true,
        fullMockSectionResult: { select: { section: true } },
        mockTest: { select: { title: true, durationMinutes: true } },
        student: { select: { user: { select: { name: true, email: true } } } },
      },
    })
  ).filter((result) => inScope(result.mockTest.title));

  const recordingByTest = new Map();
  const recordingFor = async (mockTestId) => {
    if (!recordingByTest.has(mockTestId)) recordingByTest.set(mockTestId, await ensureRecordingLengths(mockTestId, { measure: false }));
    return recordingByTest.get(mockTestId);
  };

  const changes = [];
  for (const result of results) {
    const recordingSeconds = result.skill === "LISTENING" ? await recordingFor(result.mockTestId) : null;
    const allowedSeconds = result.deadlineAt
      ? Math.max(0, Math.round((result.deadlineAt.getTime() - result.startedAt.getTime()) / 1000))
      : sectionAllowedSeconds({ skill: result.skill, fullMock: Boolean(result.fullMockSectionResult), durationMinutes: result.mockTest.durationMinutes, recordingSeconds });
    const expected = timeUsedSeconds({ startedAt: result.startedAt, endedAt: result.completedAt, allowedSeconds });
    if (result.durationSeconds !== expected) changes.push({ result, expected, allowedSeconds });
  }

  // Full Mock sittings finished without a recorded end for their Writing paper.
  const sittings = (
    await db.fullMockAttempt.findMany({
      where: { writingStartedAt: { not: null }, writingEndedAt: null },
      select: {
        id: true,
        status: true,
        writingStartedAt: true,
        fullMockTest: { select: { title: true } },
        student: { select: { user: { select: { name: true, email: true } } } },
        sectionResults: { where: { section: "WRITING" }, select: { writingSubmission: { select: { submittedAt: true, status: true } } } },
      },
    })
  ).filter((sitting) => inScope(sitting.fullMockTest.title));
  const writingEnds = [];
  for (const sitting of sittings) {
    const handedIn = sitting.sectionResults.map((link) => link.writingSubmission).filter((s) => s && s.status !== "DRAFT" && s.submittedAt);
    if (sitting.status !== "COMPLETED" || handedIn.length === 0) continue; // still running, or nothing handed in: no end to record
    writingEnds.push({ sitting, endedAt: new Date(Math.max(...handedIn.map((s) => s.submittedAt.getTime()))) });
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${results.length} completed Reading/Listening attempt(s), ${changes.length} with a wrong stored time; ${writingEnds.length} finished Full Mock sitting(s) with no recorded Writing end.${prefix ? ` (title starts with "${prefix}")` : ""}\n`);
  for (const { result, expected, allowedSeconds } of changes) {
    console.log(`• ${result.id}  "${result.mockTest.title.slice(0, 30)}"  ${result.fullMockSectionResult ? `Full Mock ${result.fullMockSectionResult.section.toLowerCase()}` : "standalone"}  ${result.student.user.name ?? result.student.user.email}`);
    console.log(`    started ${fmtDate(result.startedAt)}  ended ${fmtDate(result.completedAt)}  allowed ${fmt(allowedSeconds)}`);
    console.log(`    stored ${fmt(result.durationSeconds)} (${result.durationSeconds ?? "null"} s)  →  ${fmt(expected)} (${expected} s)`);
  }
  for (const { sitting, endedAt } of writingEnds) {
    const used = Math.min(Math.round((endedAt.getTime() - sitting.writingStartedAt.getTime()) / 1000), 3600);
    console.log(`• sitting ${sitting.id}  "${sitting.fullMockTest.title.slice(0, 30)}"  ${sitting.student.user.name ?? sitting.student.user.email}`);
    console.log(`    Writing started ${fmtDate(sitting.writingStartedAt)}  last essay handed in ${fmtDate(endedAt)}  →  writingEndedAt set; Writing time ${fmt(used)}`);
  }

  if (!apply) {
    const any = changes.length + writingEnds.length > 0;
    console.log(any ? "\nDry run only — nothing was changed. To apply:  npm run attempts:repair-time -- --apply" : "\nNothing to repair.");
  } else {
    for (const { result, expected } of changes) await db.result.update({ where: { id: result.id }, data: { durationSeconds: expected } });
    let ends = 0;
    for (const { sitting, endedAt } of writingEnds) ends += (await db.fullMockAttempt.updateMany({ where: { id: sitting.id, writingEndedAt: null }, data: { writingEndedAt: endedAt } })).count;
    console.log(`\nUpdated ${changes.length} attempt(s) and ${ends} sitting(s).`);
  }
} finally {
  await db.$disconnect();
}
