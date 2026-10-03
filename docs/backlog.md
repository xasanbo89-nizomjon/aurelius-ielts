# Backlog

Planned work that is not built yet. When a phase ships, delete its section.

## Phase H - highlighting and notes on the official exam screen

- **Highlight colour schema.** `HighlightColor` gains `RED` and `QuestionHighlight` gets a `color` column (default
  `YELLOW`). The change is parked on the branch `phase-h-wip` and is **already applied to the Neon database**
  (additive; nothing in the app reads it yet). Merge the branch together with the menu below.
- **Right-click menu** on the passage and on the questions: *Highlight*, *Notes*, *Clear*, *Clear all*. It replaces
  the small toolbar that appears after a selection today (kept as the minimal way to highlight in Phase G).
- **Notes.** Opened from the menu and saved per attempt. The `Note` model and the save / delete actions already
  exist (the old screen's Notes drawer uses them); the official screen has no way in yet.
- **Mobile long-press.** Select text with a long press on a phone or tablet and get the same menu. Today the
  selection toolbar works with a mouse and the keyboard; a real touch device has not been tested.

## Phase L - teacher preview

- **"Preview as student".** A button on a test in the teacher panel that opens the official exam screen on a
  throwaway attempt without recording a result. It does not exist yet.

## Later phases

- The Listening and Writing screens in the same official style (Listening still uses the old layout).
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

## Checks you can run

| Command | What it checks |
| --- | --- |
| `npm run check:papers` | published Reading papers are tidy, lettered once, have 40 questions and consistent highlights |
| `npm run check:parity` | student list, student exam, teacher list and teacher editor all count the same questions |
| `npm run tests:temp` | lists temporary (`_...`) tests and who attempted them |
