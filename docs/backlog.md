# Backlog

Planned work that is not built yet. When a phase ships, delete its section.

## Phase L2 - the rest of the test builder

Phase L1 is done (`docs/test-builder.md`). Left for L2:

- **A structured editor.** One page per test with its parts, groups and questions, autosaving by question id (upsert; only rows the
  teacher removes are deleted; never delete-and-recreate) and structural edits only while the test is a draft. A prepared model and
  tests exist outside the repository; they are to be rebuilt on the L1 rules.
- **Bulk answer-key paste.** Paste "1 B, 2 TRUE, 3 colour/color …" and fill the keys, with a preview before it is applied.
- **Listening part start times.** Say where each part starts inside one shared recording, so the screen can follow it (see
  "Listening follow-ups"). `passages.audioStartSeconds` already exists in the schema (nullable, unused); the validator should then
  require a start time for every part when one recording is shared.
- **Writing Task 1 picture from a PDF page.** Must work on Vercel serverless: pure JavaScript / WASM only (for example `pdfjs-dist`
  with a node canvas package), no poppler or system binaries. A page picker and a size limit. The exam screen stays picture-only
  (the page becomes a PNG when it is uploaded). `writing_tasks.bundleId`, `visualPdfPage` and `visualPdfUrl` already exist in the
  schema (nullable, unused).
- **One way to upload a recording.** Use the signed direct upload for every recording (large files exceed the server action body
  limit). Keep reading the legacy `Passage.audioUrl` as a fallback; do not delete it.
- **The Writing task bank inside the wizard.** Bring `/teacher/writing` into the New test wizard instead of building a second place
  for Writing tasks. Until then the wizard only links to it.
- **"Preview as student".** A button on a test in the teacher panel that opens the official exam screen on a throwaway attempt
  without recording a result. It does not exist yet.
- **A switch for Full Mocks.** A new version is picked into a Full Mock in that mock's editor today. A "use the newest version"
  button on the old test's page could do it in one step.

## Listening follow-ups (after Phase I)

- **Part switching with ONE shared recording.** The quick builder attaches a single recording to all four parts, and
  nothing stored says where a part begins inside it, so the screen cannot follow the recording from part to part (it
  does when each part has its own file). The student then turns the parts themselves, as the recording tells them.
  Fix: let the teacher mark where each part starts (a start time per part, set when the recording is attached) and
  switch at those times.
- **Time used.** For a standalone Listening the stored "time used" is still capped at the test's own duration; the official
  screen's own end is the recording plus 2 minutes. A test whose recording is longer than its duration therefore shows a time
  used equal to the duration. Nothing is graded on it. (In a Full Mock the allowance is the recording + 2 minutes since Phase K.)
- **First click after a reload.** A browser may refuse to start sound on a page the student has not clicked yet (it
  happens after a reload, and in some browsers on the first page too). The screen then shows "Continue the recording"
  and carries on from where the clock says the recording is. Headless Chrome never refuses, so the refusal was tested
  by making the page's first `play()` fail.

## Writing follow-ups (after Phase J)

- **A PDF as the Task 1 picture.** Phase F accepts JPG, JPEG, PNG and WEBP only (the "PDF quick-build" reads the TEXT of a
  Writing paper; the chart is attached as a picture), so a task cannot have a PDF visual and the Writing screen draws
  pictures only. If teachers need to attach a PDF page: turn the page into a PNG when it is uploaded, so the exam screen
  stays picture-only, rather than rendering PDFs in the student's browser.
- **A paired Writing test.** A task taken on its own is one part (Task 1 = Part 1 with a 20 minute clock, Task 2 = Part 2
  with 40). The two-part screen under one clock exists inside a Full Mock only; a standalone test that pairs a Task 1 with
  a Task 2 would be a new item (a task bundle).
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
- **A not-found page answers HTTP 200.** A page that streams (it has a `loading.tsx`) has already sent its status line when
  `notFound()` runs, so opening another teacher's test (`/teacher/tests/<their id>`) shows "Page not found" but with status 200.
  Nothing of the test is shown (checked in Phase L1); the problem is that anything reading the status code (monitoring,
  crawlers, status-based tests) sees "OK". Fix later: decide access before the page streams (check ownership in the layout or
  in `generateMetadata`, or drop `loading.tsx` on the routes that can 404), then assert the 404 status in the browser checks.
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
| `npm run tests:validate` | read-only: what the publish rules say about every test already in the database (`-- --only-problems`) |
| `npm run check:parity` | student list, student exam, teacher list and teacher editor all count the same questions |
| `npm run tests:temp` | lists temporary (`_...`) tests and who attempted them |
