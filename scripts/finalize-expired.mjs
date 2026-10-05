// Phase K — gives old open attempts a server deadline and hands in the ones that are already past it.
//
//   npm run attempts:finalize-expired                       DRY RUN - lists what would happen; writes nothing
//   npm run attempts:finalize-expired -- --apply            does it
//   npm run attempts:finalize-expired -- --title-prefix=_zz only attempts of tests / mocks / tasks whose title starts with that text
//
// Three things, each only for attempts that are still OPEN:
//   1. an open Reading / Listening attempt with no deadline gets one:  start + the time its test allows (Full Mock: Listening = recording + 2 minutes,
//      or the old 42 minutes when the recording's length is not stored yet - run `npm run audio:measure` first; Reading = 60 minutes).
//      An untimed test has no deadline and is left alone for ever.
//   2. an attempt past its deadline (+ the 90 s grace) is scored with the answers that were SAVED and marked handed in "time expired", as of its
//      deadline. A Full Mock sitting is carried on exactly as if the student had clicked on: the next section's "Continue" wait, or - past the wait -
//      its automatic start, which may itself be over already.
//   3. a Writing task taken on its own, started on the exam screen and past its clock, is handed in with the draft that was saved.
// Saved answers and essays are NEVER changed - they are only graded / handed in. The AI marker is not called (a later visit to the report does it).
// This is the same code the scheduled job and the lazy checks run, so it is safe to run again: a second run finds nothing left to do.
import { PrismaClient } from "@prisma/client";

import { finalizeAttempt } from "@/lib/exam/attempts";
import { ensureRecordingLengths } from "@/lib/exam/recording-length";
import { EXPIRY_GRACE_SECONDS, WRITING_ALLOWED_SECONDS, deadlineFrom, isPastDeadline, sectionAllowedSeconds } from "@/lib/exam/section-deadline";
import { settleFullMockAttempt } from "@/lib/full-mock-attempts";
import { WRITING_SAVE_GRACE_SECONDS } from "@/lib/writing/constants";
import { sittingAllowedSeconds, submitWritingSitting } from "@/lib/writing-sitting";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const prefixArg = args.find((arg) => arg.startsWith("--title-prefix"));
const prefix = prefixArg ? prefixArg.slice(prefixArg.indexOf("=") + 1) : null;
if (prefixArg && !prefix) {
  console.error("--title-prefix needs a value (e.g. --title-prefix=_zz). An empty prefix would match everything - refusing to run.");
  process.exit(1);
}

const db = new PrismaClient();
const now = new Date();
const inScope = (title) => !prefix || title.startsWith(prefix); // matched here: a title filter in the query would treat "_" as a wildcard
const fmtDate = (date) => date.toISOString().replace("T", " ").slice(0, 16) + "Z";
const who = (student) => student.user.name ?? student.user.email;
const log = [];

try {
  // ---- 1 + 2: open Reading / Listening attempts ---------------------------------------------------------------------------------------------------
  const open = (
    await db.result.findMany({
      where: { completedAt: null, skill: { in: ["READING", "LISTENING"] } },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        skill: true,
        startedAt: true,
        deadlineAt: true,
        mockTestId: true,
        mockTest: { select: { title: true, durationMinutes: true } },
        fullMockSectionResult: { select: { attemptId: true, section: true } },
        student: { select: { user: { select: { name: true, email: true } } } },
        _count: { select: { answers: true } },
      },
    })
  ).filter((result) => inScope(result.mockTest.title));

  const recordingByTest = new Map();
  const recordingFor = async (mockTestId) => {
    if (!recordingByTest.has(mockTestId)) recordingByTest.set(mockTestId, await ensureRecordingLengths(mockTestId, { measure: false }));
    return recordingByTest.get(mockTestId);
  };

  const plans = [];
  for (const result of open) {
    const recordingSeconds = result.skill === "LISTENING" ? await recordingFor(result.mockTestId) : null;
    const allowed = sectionAllowedSeconds({ skill: result.skill, fullMock: Boolean(result.fullMockSectionResult), durationMinutes: result.mockTest.durationMinutes, recordingSeconds });
    const deadline = result.deadlineAt ?? deadlineFrom(result.startedAt, allowed);
    plans.push({
      result,
      deadline,
      sets: result.deadlineAt == null && deadline != null,
      overdue: isPastDeadline(deadline, now, EXPIRY_GRACE_SECONDS),
      fixedListening: result.skill === "LISTENING" && recordingSeconds == null && result.fullMockSectionResult != null,
    });
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"} (now ${fmtDate(now)})${prefix ? ` - title starts with "${prefix}"` : ""}\n`);
  console.log(`Open Reading / Listening attempts: ${plans.length}`);
  for (const plan of plans) {
    const { result, deadline } = plan;
    const where = result.fullMockSectionResult ? `Full Mock ${result.fullMockSectionResult.section.toLowerCase()}` : "standalone";
    const state = deadline == null ? "untimed - left alone" : `deadline ${fmtDate(deadline)}${plan.sets ? " (to be stored)" : ""}${plan.fixedListening ? " (fixed 42 min: recording length not stored)" : ""} - ${plan.overdue ? "PAST DEADLINE: would be handed in as time expired" : "still running"}`;
    console.log(`• ${result.id}  "${result.mockTest.title.slice(0, 32)}"  ${where}  ${who(result.student)}  started ${fmtDate(result.startedAt)}  ${result._count.answers} saved answer(s)\n    ${state}`);
  }

  // ---- Full Mock sittings in progress -------------------------------------------------------------------------------------------------------------
  const sittings = (
    await db.fullMockAttempt.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        currentSection: true,
        writingStartedAt: true,
        writingEndedAt: true,
        fullMockTest: { select: { title: true, transitionLimitMinutes: true, _count: { select: { writingSections: true } } } },
        student: { select: { user: { select: { name: true, email: true } } } },
        sectionResults: { where: { section: { in: ["LISTENING", "READING"] } }, select: { section: true, result: { select: { completedAt: true } } } },
      },
    })
  ).filter((sitting) => inScope(sitting.fullMockTest.title));

  console.log(`\nFull Mock sittings in progress: ${sittings.length}`);
  for (const sitting of sittings) {
    const listening = sitting.sectionResults.find((r) => r.section === "LISTENING")?.result;
    const reading = sitting.sectionResults.find((r) => r.section === "READING")?.result;
    const limitMs = sitting.fullMockTest.transitionLimitMinutes * 60_000;
    const writingDue = sitting.writingStartedAt && !sitting.writingEndedAt && isPastDeadline(new Date(sitting.writingStartedAt.getTime() + WRITING_ALLOWED_SECONDS * 1000), now, EXPIRY_GRACE_SECONDS);
    const waitingTooLong =
      (listening?.completedAt && !reading && now.getTime() >= listening.completedAt.getTime() + limitMs) ||
      (reading?.completedAt && sitting.fullMockTest._count.writingSections > 0 && !sitting.writingStartedAt && now.getTime() >= reading.completedAt.getTime() + limitMs);
    const overdueSection = plans.some((plan) => plan.result.fullMockSectionResult?.attemptId === sitting.id && plan.overdue);
    const note = overdueSection ? "a section is past its deadline - would be settled" : writingDue ? "Writing is past its hour - would be handed in with the saved drafts" : waitingTooLong ? "waiting on a Continue screen past the limit - the next section would start by itself" : "nothing to do yet";
    console.log(`• ${sitting.id}  "${sitting.fullMockTest.title.slice(0, 32)}"  ${who(sitting.student)}  at ${sitting.currentSection.toLowerCase()}\n    ${note}`);
  }

  // ---- 3: Writing tasks taken on their own ----------------------------------------------------------------------------------------------------------
  const drafts = (
    await db.writingSubmission.findMany({
      where: { status: "DRAFT", startedAt: { not: null } },
      orderBy: { startedAt: "asc" },
      select: { id: true, studentId: true, startedAt: true, wordCount: true, task: { select: { title: true, taskNumber: true, fullMockUse: { select: { id: true } } } }, student: { select: { user: { select: { name: true, email: true } } } } },
    })
  ).filter((draft) => draft.task && !draft.task.fullMockUse && inScope(draft.task.title));
  const lateDrafts = drafts.filter((draft) => {
    const allowed = sittingAllowedSeconds(draft.startedAt, draft.task.taskNumber);
    return allowed != null && now.getTime() > draft.startedAt.getTime() + (allowed + WRITING_SAVE_GRACE_SECONDS) * 1000;
  });
  console.log(`\nWriting sittings on their own, still open: ${drafts.length}, of which past their clock: ${lateDrafts.length}`);
  for (const draft of lateDrafts) console.log(`• ${draft.id}  "${draft.task.title.slice(0, 32)}"  ${who(draft.student)}  started ${fmtDate(draft.startedAt)}  ${draft.wordCount ?? 0} word(s) saved - would be handed in with the saved draft`);

  const todo = plans.filter((plan) => plan.sets || plan.overdue).length + sittings.length + lateDrafts.length;
  if (!apply) {
    console.log(todo ? "\nDry run only - nothing was changed. To apply:  npm run attempts:finalize-expired -- --apply" : "\nNothing to do.");
  } else {
    // 1. deadlines (only where there is none)
    let stored = 0;
    for (const plan of plans) {
      if (!plan.sets) continue;
      const done = await db.result.updateMany({ where: { id: plan.result.id, completedAt: null, deadlineAt: null }, data: { deadlineAt: plan.deadline } });
      stored += done.count;
    }
    // 2a. standalone attempts past their deadline
    let handedIn = 0;
    for (const plan of plans) {
      if (!plan.overdue || plan.result.fullMockSectionResult) continue;
      try {
        await finalizeAttempt(plan.result.id, { endedAt: plan.deadline, reason: "TIME_EXPIRED" });
        handedIn++;
      } catch (error) {
        log.push(`attempt ${plan.result.id}: ${error.message}`);
      }
    }
    // 2b. Full Mock sittings: the same settle the scheduled job runs
    let settledSteps = 0;
    for (const sitting of sittings) {
      try {
        const { steps } = await settleFullMockAttempt(sitting.id, { now });
        settledSteps += steps.length;
        if (steps.length) console.log(`  sitting ${sitting.id}: ${steps.join(", ")}`);
      } catch (error) {
        log.push(`sitting ${sitting.id}: ${error.message}`);
      }
    }
    // 3. Writing on its own
    let essays = 0;
    for (const draft of lateDrafts) {
      try {
        const done = await submitWritingSitting(draft.studentId, { submissionId: draft.id }, { serverExpiry: true });
        if (done.success) essays++;
        else log.push(`writing ${draft.id}: ${done.error}`);
      } catch (error) {
        log.push(`writing ${draft.id}: ${error.message}`);
      }
    }
    console.log(`\nStored ${stored} deadline(s); handed in ${handedIn} standalone attempt(s); ${settledSteps} Full Mock step(s); handed in ${essays} essay(s).`);
    if (log.length) console.log(`Problems:\n  ${log.join("\n  ")}`);
  }
} finally {
  await db.$disconnect();
}
