# Backlog

Planned work that is not built yet. When a phase ships, delete its section.

## Phase L2 follow-ups (what the test builder still lacks)

Phase L1 and L2 are done (`docs/test-builder.md`). Known limits and what could come next:

- **The PDF importer's "Choose TWO" is tested offline only.** Since Phase M a block whose instructions say "Choose TWO / THREE letters" and whose numbers make
  whole pairs is imported as one question per pair (`chooseCount`, one mark per letter), whichever way the answer key prints the letters ("21 A 22 C", "21-22 A, C").
  It is covered by `check:choose` with hand-made reader output; no real PDF with a Choose TWO has been run through the AI reader yet. A key that does not name exactly
  the right number of different letters is flagged in the import warnings (the stored question is padded so the import stays valid).
- **A table is cells of text and answer boxes.** The grid has a header row, rows, columns, a title and a note; no merged cells (a heading across the whole width is
  kept if a table has one, but the grid cannot make one) and no formatting inside a cell.
- **A Writing test has two reports.** Both parts are sat together and handed in together, but each is stored, marked and reported as its own submission (the student
  lands on the task list and opens each report); there is no single combined result page for a Writing test.
- **The Writing Reviews queue is still "your students".** Since Phase M the analytics cards at the top of `/teacher/writing` count every student for a Root Teacher
  (the same `studentScope` rule as tests), like the task bank and the student pickers; the review queue, its counters and the teacher's feedback on a submission
  (`/teacher/writing-reviews`) still cover only the Root Teacher's own students.
- **One picture per Writing task.** A Task 1 with two charts needs a second picture; the screen draws one.
- **The PDF page is rendered by WebAssembly (PDFium).** It works with `next build && next start`; it has not been run on Vercel itself. If the first
  Writing PDF there fails, check that `next.config.ts` (`serverExternalPackages`, `outputFileTracingIncludes`) is applied and that the function has enough memory
  (a page is drawn at most 1800 x 2000 px, about 15 MB of pixels while it is encoded).
- **Start times follow the browser's clock.** The student's screen moves to the next part when the playing recording reaches its start time
  (`timeupdate`, a few times a second), so it can be a fraction of a second late; the exam's deadlines are unaffected.
- **A new Reading or Listening detail route needs a 404 rule.** `src/lib/route-guard.ts` lists the routes that address one record; a route added later with a
  `loading.tsx` answers 404 only once it has a rule there. A student without a subscription sees the lock screen (status 200) on Articles, the libraries and
  Speaking results - that is the page's own gate and was not changed. A finished attempt's address redirects to its results from inside the streamed page, so
  that redirect also answers 200 (the browser follows it; nothing reads it as an error).
- **Archiving the previous version waits for students.** "Archive previous version" does nothing while a student is in the middle of it; the message says so and
  it can be archived from the Tests list later.

## Listening follow-ups (after Phase I)

- **Time used.** For a standalone Listening the stored "time used" is still capped at the test's own duration; the official
  screen's own end is the recording plus 2 minutes. A test whose recording is longer than its duration therefore shows a time
  used equal to the duration. Nothing is graded on it. (In a Full Mock the allowance is the recording + 2 minutes since Phase K.)
- **First click after a reload.** A browser may refuse to start sound on a page the student has not clicked yet (it
  happens after a reload, and in some browsers on the first page too). The screen then shows "Continue the recording"
  and carries on from where the clock says the recording is. Headless Chrome never refuses, so the refusal was tested
  by making the page's first `play()` fail.

## Writing follow-ups (after Phase J)

- **No minimum-length notice or word-count warning, on purpose.** The platform is paid and has no practice mode: exams always run in the
  official way, so the Writing screen never warns or blocks (a practice mode will not be built).
- **Highlights and notes on the task text** are kept in the browser (they survive a reload on the same computer, they do not
  follow the student to another one, and the teacher does not see them). Keeping them on the server needs a table keyed by
  the submission.
- **A late hand-in uses what was saved in time.** If the connection is down at the end and stays down for more than 90
  seconds after the time, the words typed since the last successful save are not part of the hand-in (they stay in the
  browser's storage). The same rule as the Full Mock has always had; raising `WRITING_SAVE_GRACE_SECONDS` is the one knob.
- **Study time.** A sitting on the official screen is credited when it is handed in, from the server's clock (never more than
  the time allowed). The old screen still pings a heartbeat every 30 s. That action does streak and achievement work and took
  7-22 s on a slow link; a page's server actions run one at a time, so it queues in front of the autosave - no exam screen
  should use it.
- **Drafts of a Full Mock in the student's task list.** The Writing tasks of a mock are assigned to the student when Writing
  starts, so their drafts show up in the task list like any draft. Opened from there on the standalone screen, a draft with no
  start time is untimed and outside the mock's clock.
- **Autosave latency here.** A save is four database queries (about 3 s on this machine's link to the database, a fraction of
  that near it). The text is in the browser the whole time; only the "Saved" mark waits.

## Full Mock follow-ups (after Phase K)

- **The scheduled job needs a schedule.** `/api/cron/finalize-expired` exists and is tested, but nothing calls it until it is set up
  (`docs/server-expiry.md`): Vercel Cron more often than once a day needs the Pro plan, otherwise an external pinger. Until then
  sections are finalised when a student or a teacher opens them.
- **The Live Monitor polls.** It asks the server every 20 seconds (a server action, one light query); it has no push channel.
  A thousand students sitting at once would want a lighter, cached endpoint.
- **Late text is for the official Writing screens.** The old Writing screen (`?ui=legacy`) keeps no browser copy, so it has nothing to
  upload. Late text is never merged into a submission automatically; the teacher reads it and decides.
- **The Listening deadline assumes the recording starts with the sitting.** It is start + recording + 2 minutes. The screen starts the
  recording as soon as the recordings are loaded, so the two agree to within a few seconds; a student whose recording only began
  more than the 90 s grace after the start would find the server's deadline before their own review time ends. Anchoring the
  deadline on the moment the recording really began would need that moment stored on the server.
- **Speaking** is not part of the new section clocks: a Full Mock with a Speaking part still sends the student to it after Writing, with
  no server deadline.
- **Standalone Reading / Listening with no duration** are untimed and never expire; only tests that have a duration get a deadline.
- **A teacher who is not the student's teacher** but made the mock sees that student's sitting in the Live Monitor (the same rule the
  Mock Results page has always had).

## Phase M2 follow-ups (the review in the exam layout)

- **Phase O (results hidden from the student).** The post-submit redirect (`submitAttemptAction`), the old-address redirect of a finished attempt, and the review page all
  assume the student may see their results (Phase M2 says so in one place each). The hidden case needs one switch there.
- **The teacher's read-only attempt review is still the Phase M split page** (`/teacher/band-conversation/<student>/attempts/<attempt>`); it could draw the same official
  layout with a teacher's header. The older review components in `src/components/exam/review/` exist only for it.
- **The review no longer has the "Performance analytics" panel** (accuracy by part and by question type, time per part); it is on the results page ("Full results page" in
  the dialog) and, across attempts, on the student's Results analysis tab.
- **Old per-student AI explanations are retired from the student screens**, not deleted: `explainMoreAction`, `explainWrongAnswerAction`, the `AiExplanation*` tables and
  `dailyExplanationLimit` (a per-student limit) are unused by the UI now. Remove them in a later clean-up once nobody needs the history.
- **An explanation is written for the question's wording and right answer, not for the passage.** If a teacher edits the passage text of a draft test, an approved explanation
  stays valid (and may quote words that moved). Evidence is re-anchored by its quote; an explanation is not.
- **The explanation writer sees one passage** (at most 16,000 characters). A Listening part without a transcript cannot be explained ("This part has no transcript").
- **Bulk generation runs from the teacher's browser**, one request after another (about 3-6 seconds each); closing the page stops it - what was written is kept as drafts.

## Phase M follow-ups (results analysis)

- **Evidence is set by hand (or confirmed from an AI suggestion).** No test has any yet: the review's "Show in passage" appears number by number as teachers set it
  (`/teacher/tests/<id>/evidence`). Without evidence the review still marks the answer's own words where they literally stand in the passage (the Phase 46 search).
  A Listening part needs a transcript before evidence can be set. One range per question number; two places for one answer need a second range (not built).
- **Time per part only exists for attempts taken after Phase M.** Older attempts, and attempts where the student never changed part, show none; a Listening attempt
  records the part changes the screen makes by itself with the recording. The time in a part is counted from when the server noted the move (the screen sends it about
  a second after the move), so it is accurate to a second or two.
- **The older Weakness / Strength trackers** on the Band Score Center's Overview tab count answer rows (a matching or summary row counts once; a question left empty
  does not count at all). The new Results analysis tab counts question numbers and includes left-empty questions, so its figures can differ. Moving the old trackers onto
  the new numbers is a small change if you want one figure everywhere.
- **Writing statistics are the teacher's mark** (with the AI estimate drawn separately). There is no per-criterion trend yet.
- **The Writing Reviews queue is still "your students"** (see above); the results analysis is not affected.
- **Dates in the filters are UTC** (a result finished late in the evening in Tashkent counts for the next day in UTC).
- **`DIRECT_URL`:** the app uses Neon's pooled address; migrations should use the direct one (`directUrl` in the Prisma datasource). Not set up yet - see the report of Phase M.

## Later phases

- Red highlights: `HighlightColor.RED` exists in the database (Postgres cannot drop an enum value) but nothing draws or
  stores it; the menu has one highlight colour, yellow.
- Retire the old Reading and Listening screens (`NEXT_PUBLIC_EXAM_UI=legacy`) once the official ones have had a
  release cycle. The old Listening screen still has its own player (play, seek, speed) and its own highlight toolbar.

## Known items from earlier phases

- The draft Reading passage titled "Cambridge" has no blank lines, so `npm run passages:normalize` leaves it alone
  (its paragraph ends are only visible as line ends). Add blank lines in the editor, or run the script with
  `--include-single-block`.
- 17 old completed Results have no stored band; the pages work it out when they are shown
  (`harness/backfill-bands` was never applied).
- An internal-titled ("_...") Full Mock is hidden from lists but can still be opened by its direct address.
- The real published tests are titled "IELTS Reading Test" (Xasan) and "IELTS Reading Test (new version)" (Azizbek Tursunov): the second was made
  before versions kept their title, so students still see "(new version)" in its name. Renaming a stored title is a data change and was not done.
- Old attempts: `npm run attempts:repair-time` and `npm run attempts:finalize-expired` (both dry runs by default) list what Phase K
  would correct on data from before it; see `docs/server-expiry.md`.
- The matching drag-and-drop uses click-to-place on touch screens (HTML5 drag does not work there).
- The highlight menu on a touch screen was tested with Chrome's touch emulation only. Headless Chrome does not select
  text on a synthesized long-press, so the test makes the selection by script (which is what the system's selection
  handles do as far as the page can tell); a real phone or tablet has not been tried.

## Checks you can run

| Command | What it checks |
| --- | --- |
| `npm run check:writing` | the Writing screen's safety logic, with no database: the word counter, the instruction sentences, the browser-copy rules and the draft engine (autosave, retry, lost answers, black-holed requests, older window refused) against a fake server |
| `npm run check:expiry` | the server clock's rules, with no database: deadlines (recording + 2 minutes, 60 minutes, untimed never expires, the 90 s grace), time used as a sum, the Writing band and the combined figure's rounding (6.25 → 6.5, 6.75 → 7.0, 6.125 → 6.0) |
| `npm run check:papers` | published Reading papers are tidy, lettered once, have 40 questions and consistent highlights |
| `npm run audio:measure` / `attempts:finalize-expired` / `attempts:repair-time` | Phase K data scripts: dry run by default, `-- --apply` to write (see `docs/server-expiry.md`) |
| `npm run check:publish` | no database: the publish rules (39 / 41 questions, a gap, a missing or invalid answer, a Listening test without audio, a complete test passes), typed answers with alternatives, the importer, and reviews against stored scores |
| `npm run check:grading` | read-only: every stored answer key still validates and scores itself, and every stored student answer re-grades to the verdict stored at hand-in |
| `npm run check:l1` | the real database with its own tagged fixtures (removed at the end): teacher vs Root access, the validator on stored tests, the edit rule, ids kept, versions, review vs stored score |
| `npm run check:builder` | no database: the structured editor's model (every question type -> stored rows -> the student's numbers), the answer-key paste, the start-time rules and part switching |
| `npm run tests:validate` | read-only: what the publish rules say about every test already in the database (`-- --only-problems`) |
| `npm run check:parity` | student list, student exam, teacher list and teacher editor all count the same questions |
| `npm run tests:temp` | lists temporary (`_...`) tests and who attempted them |
