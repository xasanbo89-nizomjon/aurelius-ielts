# Backlog

Planned work that is not built yet. When a phase ships, delete its section.

## Phase L - teacher preview

- **"Preview as student".** A button on a test in the teacher panel that opens the official exam screen on a
  throwaway attempt without recording a result. It does not exist yet.

## Later phases

- The Listening and Writing screens in the same official style (Listening still uses the old layout, so it keeps the
  old highlight toolbar; the highlight / notes menu of Phase H is only on the official Reading screen).
- Show a student's highlight notes after the test is handed in (the review page and the teacher's result page draw the
  highlights but not the notes).
- Red highlights: `HighlightColor.RED` exists in the database (Postgres cannot drop an enum value) but nothing draws or
  stores it; the menu has one highlight colour, yellow.
- Retire the old Reading screen (`NEXT_PUBLIC_EXAM_UI=legacy`) once the official one has had a release cycle.

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
