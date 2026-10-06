# Backlog

Planned work that is not built yet. When a phase ships, delete its section.

## Phase L2 follow-ups (what the test builder still lacks)

Phase L1 and L2 are done (`docs/test-builder.md`). Known limits and what could come next:

- **Writing tasks belong to one teacher.** Tests, Full Mocks and access codes are managed by a Root Teacher for everyone; the Writing task bank
  (`/teacher/writing`) still lists and edits only the tasks the signed-in teacher created, Root Teacher included. ("Preview as student" follows the
  test rule: a Root Teacher can preview any task.) Bringing the bank under the same access rule is a small change in `src/lib/writing-tasks.ts`.
- **A Writing test is sat as two tasks.** Task 1 + Task 2 made together are previewed as one paper, but a student takes each task on its own screen
  (20 and 40 minutes); a standalone sitting of both under one clock needs a change to the student's Writing screen and was out of scope.
- **"Choose TWO" counts as one number.** In the editor (and for the student) a multiple-choice question with "more than one correct answer" is one numbered
  question, as `numberQuestions` has always counted it. A real IELTS "choose TWO" takes two numbers; a teacher who wants that makes two questions.
- **Table completion is drawn as lines.** The editor takes a table as rows of cells separated by `|` with `{{}}` boxes, stores it as a summary-style question,
  and the student's screen shows it line by line, not as a grid. A real table editor and a grid on the student's screen are a later step.
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

- **Practice mode (Phase N).** The exam screen has no minimum-length notice and no word-count warning on purpose; they belong
  to a practice mode.
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

## Later phases

- Show a student's highlight notes after the test is handed in (the review page and the teacher's result page draw the
  highlights but not the notes).
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
