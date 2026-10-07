# Server-side expiry (Phase K)

Until Phase K only the student's own browser ended a section: close the tab and the attempt stayed "in progress" for ever.
Now every timed section has a deadline kept on the server, and the server hands in whatever has run past it.

## The deadlines

| Section | Deadline |
| --- | --- |
| Full Mock Listening | start + the length of the recording(s) + 2 minutes of review (`Result.deadlineAt`) |
| Full Mock Reading | start + 60 minutes |
| Full Mock Writing | start + 60 minutes, both tasks together (`FullMockAttempt.writingStartedAt`) |
| Reading / Listening on its own | start + the test's own duration; a test with no duration is untimed and **never expires** |
| Writing on its own | start + 20 minutes (Task 1) or 40 (Task 2) (`WritingSubmission.startedAt`); a draft with no start is untimed |

* The recording's length is measured **on the server** when the audio is attached (`music-metadata`, stored in
  `Passage.audioDurationSeconds`), never taken from the browser. A Full Mock whose recording length is not stored yet falls back to the
  old 40 + 2 minutes.
* A section that is past its deadline is left alone for a **90 second grace** (`EXPIRY_GRACE_SECONDS`): the student's browser hands the
  section in at the deadline, and that should win over the server's.
* When the server finalises a section it scores it with the **saved** answers and marks it handed in **as of its deadline** with the
  reason "time expired" (`Result.endReason`, `FullMockAttempt.writingEndReason`). Saved answers and essays are never changed.
* The "Continue" screens: when a section ends the next one does not start until the student presses Continue, or until the mock's
  wait limit (`FullMockTest.transitionLimitMinutes`, default 5) has passed since the previous section **ended** - then the server starts it,
  with its clock counted from the end of the wait, so waiting longer gains nothing. A student away for hours passes through every
  section in one go.
* Time used per section = `min(end - start, the section's allowance)`; a Full Mock's total is the **sum** of its sections
  (the pauses on the Continue screens are not counted).

## Who finalises, and when

1. **Lazily, on every read.** A student opening an attempt or the sitting, and a teacher opening Mock Results or the Live Monitor, finalises
   whatever is overdue first (`settleFullMockAttempt`, `settleOverdueAttempts`). Nothing anyone is looking at is ever stale.
2. **A scheduled job** for the attempts nobody is looking at: `GET /api/cron/finalize-expired` with `Authorization: Bearer <CRON_SECRET>`.
   It is idempotent, bounded per run and light (the AI marker is not called), so running it more often only makes expiry sooner.
3. A **teacher** can end a student's running section early from the Live Monitor (after a confirmation); it is finalised exactly like an
   expiry, with the reason "ended by the teacher".

All four ways go through one function (`finalizeAttempt`, guarded by "not yet completed"), so a hand-in from the browser and the server's
expiry arriving together change nothing twice.

## Setting up the scheduled job

The route refuses to run (503) unless `CRON_SECRET` is set, and answers 401 to a wrong secret.

1. Set `CRON_SECRET` in the project's environment to a long random string (for example `openssl rand -hex 32`).
2. Schedule a call every few minutes.
   * **Vercel Pro** - add a `vercel.json` (it is deliberately **not** in the repository: a cron more frequent than once a day is refused on
     the Hobby plan and would make the deployment fail):

     ```json
     { "crons": [{ "path": "/api/cron/finalize-expired", "schedule": "*/5 * * * *" }] }
     ```

     Vercel sends `Authorization: Bearer <CRON_SECRET>` by itself when the project has a `CRON_SECRET`.
   * **Vercel Hobby, or any other host** - use an external pinger (cron-job.org, GitHub Actions, UptimeRobot) that calls
     `https://<your-domain>/api/cron/finalize-expired` every 5 minutes with the header `Authorization: Bearer <CRON_SECRET>`.
   **The Speaking practice has a second job on the same secret** (Phase Q-B, `docs/speaking-practice-ai.md`): `GET /api/cron/speaking-audio` finishes recorded practices whose AI assessment was never
   started or whose worker died, and drops practices that were started more than a day ago but never received their recording. Schedule it the same way (every 5 minutes is plenty); without it a stuck assessment
   is picked up when somebody looks at it.
3. Check it: `curl -i -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/cron/finalize-expired` answers 200 with the counts
   (`standaloneAttempts`, `fullMockAttempts`, `fullMockSteps`, `writingSittings`, `errors`); without the header it answers 401.

If the job never runs nothing breaks: students and teachers trigger the same finalisation when they open an attempt. The job only matters
for the numbers nobody looks at (a teacher's results table is also settled when it is opened).

## Old data: three scripts, dry run first

All three are dry runs unless `--apply` is given, list every row they would change, never touch saved answers, and can be run again.
`--title-prefix=<text>` limits them to tests whose title starts with that text (for a rehearsal on test data).

| Order | Command | What it does |
| --- | --- | --- |
| 1 | `npm run audio:measure` | measures every Listening recording and stores its length; the deadlines of Full Mock Listening sittings are built from it |
| 2 | `npm run attempts:finalize-expired` | gives open attempts that have no deadline one, and hands in the ones already past it (with the saved answers, "time expired") |
| 3 | `npm run attempts:repair-time` | corrects the stored "time used" of finished attempts and fills in the end of old Full Mock Writing papers |

Add `-- --apply` to write (for example `npm run audio:measure -- --apply`).
