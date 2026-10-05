# Backlog

Planned work that is not built yet. When a phase ships, delete its section.

## Phase L - teacher preview

- **"Preview as student".** A button on a test in the teacher panel that opens the official exam screen on a
  throwaway attempt without recording a result. It does not exist yet.

## Listening follow-ups (after Phase I)

- **Part switching with ONE shared recording.** The quick builder attaches a single recording to all four parts, and
  nothing stored says where a part begins inside it, so the screen cannot follow the recording from part to part (it
  does when each part has its own file). The student then turns the parts themselves, as the recording tells them.
  Fix: let the teacher mark where each part starts (a start time per part, set when the recording is attached) and
  switch at those times.
- **Length of the recording.** The server does not know how long a recording is: the browser measures it when it loads
  the file. The 2 minutes of review time are counted from the end of the last recording as measured there, and a page
  opened later works out its position from the server's start time. Storing the length when the audio is uploaded
  would let the server hand a finished Listening in by itself even if the student never comes back.
- **Time used.** For a standalone Listening the stored "time used" is still capped at the test's own duration (and at
  42 minutes in a Full Mock); the official screen's own end is the recording plus 2 minutes. A test whose recording is
  longer than its duration therefore shows a time used equal to the duration. Nothing is graded on it.
- **First click after a reload.** A browser may refuse to start sound on a page the student has not clicked yet (it
  happens after a reload, and in some browsers on the first page too). The screen then shows "Continue the recording"
  and carries on from where the clock says the recording is. Headless Chrome never refuses, so the refusal was tested
  by making the page's first `play()` fail.

## Later phases

- The Writing screen in the same official style.
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
- `npm run attempts:repair-time` lists one completed attempt whose stored time used is longer than the test allowed.
- The matching drag-and-drop uses click-to-place on touch screens (HTML5 drag does not work there).
- The highlight menu on a touch screen was tested with Chrome's touch emulation only. Headless Chrome does not select
  text on a synthesized long-press, so the test makes the selection by script (which is what the system's selection
  handles do as far as the page can tell); a real phone or tablet has not been tried.

## Checks you can run

| Command | What it checks |
| --- | --- |
| `npm run check:papers` | published Reading papers are tidy, lettered once, have 40 questions and consistent highlights |
| `npm run check:parity` | student list, student exam, teacher list and teacher editor all count the same questions |
| `npm run tests:temp` | lists temporary (`_...`) tests and who attempted them |
