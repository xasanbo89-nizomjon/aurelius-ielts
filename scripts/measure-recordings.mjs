// Phase K — measures the length of every Listening recording and stores it on the test's passages (Passage.audioDurationSeconds).
// The Listening deadline of a sitting is built from it (recording + 2 minutes of review); a test whose length is not stored yet falls back to the
// old fixed 40 + 2 minutes in a Full Mock, so run this once before the other Phase K scripts.
//
//   npm run audio:measure                              DRY RUN - reads each recording and prints its length; writes nothing
//   npm run audio:measure -- --apply                   stores the measured lengths
//   npm run audio:measure -- --title-prefix=_zz        only tests whose title starts with that text (for a rehearsal on test data)
//
// Only the new column audioDurationSeconds is written, and only where it is empty. Nothing else changes. Safe to run again.
import { PrismaClient } from "@prisma/client";

import { inspectRecordingLengths } from "@/lib/exam/recording-length";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const prefixArg = args.find((arg) => arg.startsWith("--title-prefix"));
const prefix = prefixArg ? prefixArg.slice(prefixArg.indexOf("=") + 1) : null;
if (prefixArg && !prefix) {
  console.error("--title-prefix needs a value (e.g. --title-prefix=_zz). An empty prefix would match every test - refusing to run.");
  process.exit(1);
}

const db = new PrismaClient();
const fmt = (seconds) => (seconds == null ? "—" : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`);

try {
  const found = await db.mockTest.findMany({
    where: { type: "LISTENING", passages: { some: { OR: [{ audioPath: { not: null } }, { audioUrl: { not: null } }] } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, isPublished: true },
  });
  // The prefix is matched here, not in the query: a title filter would treat "_" as a wildcard.
  const tests = prefix ? found.filter((test) => test.title.startsWith(prefix)) : found;

  console.log(`${apply ? "APPLY" : "DRY RUN"} - ${tests.length} Listening test(s) with a recording${prefix ? ` (title starts with "${prefix}")` : ""}.\n`);
  let measured = 0;
  let already = 0;
  let unreadable = 0;
  for (const test of tests) {
    const reports = await inspectRecordingLengths(test.id, { persist: apply });
    for (const report of reports) {
      if (report.status === "stored") already++;
      else if (report.status === "measured") measured++;
      else unreadable++;
      const length = report.storedSeconds ?? report.measuredSeconds;
      const note = report.status === "stored" ? "already stored" : report.status === "measured" ? (apply ? "stored now" : "would be stored") : "COULD NOT BE READ - the sitting keeps the fixed 42 minutes";
      console.log(`• "${test.title.slice(0, 40)}"${test.isPublished ? "" : " (draft)"}  ${fmt(length)} (${length ?? "?"} s)  ${report.passageIds.length} part(s)  - ${note}`);
    }
  }

  console.log(`\n${already} recording(s) already had a length, ${measured} ${apply ? "measured and stored" : "can be measured"}, ${unreadable} could not be read.`);
  if (!apply) console.log(measured ? "Dry run only - nothing was changed. To apply:  npm run audio:measure -- --apply" : "Nothing to do.");
} finally {
  await db.$disconnect();
}
