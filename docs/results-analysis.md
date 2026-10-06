# Results analysis (Phase M)

Everything in this phase happens **after** a test is handed in: the review page, the student's statistics and the teacher's analytics. Nothing here touches the
exam screens, the clocks, the scoring or any stored score. Every number comes from real attempts; where there is not enough data the page says so.

## What counts

- **One figure, one unit: a question NUMBER** - what the student sees as 1-40. A matching task of five headings is five numbers, a "Choose TWO" is two, a summary
  with three blanks is three. A question left unanswered counts as asked and wrong (it has no answer row; it adds 0 marks).
- **Marks are the stored ones.** Each answer was scored when the attempt was handed in (`answers.pointsAwarded`); the statistics add those up and never re-grade.
  A question's numbers right = its stored marks x the numbers it covers / what it is worth (one mark per number in every test today, so that is just the marks).
- **Which attempts:** finished Reading / Listening attempts; not of an internal test (a title starting with `_`); not a section of a Full Mock that is still being
  sat (a section is not marked between papers, so it is not analysed either).
- **Who is seen:** a student sees only themselves; a teacher sees their own students; a Root Teacher sees every student. One helper decides it for tests
  (`testScope`) and for students (`studentScope`, `src/lib/exam/test-access.ts`).

## Answer evidence (where the answer is in the passage)

- A question stores `evidence` (JSON, `questions.evidence`, null = none): one item per question number - `{ slot, passageId, start, end, quote, state, source, at }`.
  `start` / `end` are character offsets into `Passage.content` - the stored text itself, the same string every highlight is measured in (paragraph letters
  are drawn over it, never part of it). `quote` is the text at that range when it was set; it is how the range is found again after the passage is edited, and
  how an item is dropped (never left pointing at other words) when its words are gone.
- **A student only ever sees `CONFIRMED` items.** An AI suggestion is stored as `SUGGESTED` and stays invisible to students until a teacher confirms it.
- **Setting it:** `/teacher/tests/<id>/evidence` (a button on the test page, with "set for 23/40"): pick a question number, select the words in the passage, press
  "Set as evidence for Q n". Saved at once. It works on **any test the teacher manages - published, or already taken** - because evidence changes no question, answer or
  score (unlike the structure of a test, which is locked once attempts exist, see `test-lock.ts`). A True / False / Not Given question whose answer is Not Given needs none.
- **"Suggest with AI"** (optional): off until the teacher switches it on for themselves (`ai_settings.evidenceSuggestionsEnabled`), a daily limit per teacher
  (`dailyEvidenceSuggestionLimit`, default 30, counted from `evidence_suggestion_logs`). The model only names the *words*; the server finds them in the passage
  (a quote that is not in the text is simply not found), stores them as a suggestion, and the teacher confirms or rejects.
- **Editing a draft test's passage** re-finds each item by its quote (`saveBuilder`); **Create new version / Duplicate** copy the evidence with the new passage ids.
- **Validator:** "Answer evidence is not set for N of M questions (...)" is a **warning** - the test is complete and publishes - shown on the test page's checklist
  data (`tests:validate` prints it as a note).

## The review page (Reading and Listening)

For every question number: the student's answer, the right answer (accepted alternatives as "colour / color"), and right / wrong - all from the stored verdict, so
the review always agrees with the stored score. A matching or summary row is a small table, one line per number; a "Choose TWO" row is one set in any order.
**Show in passage** appears wherever a teacher confirmed evidence: it switches to that passage (or transcript), scrolls to the words and marks them. The student's own
highlights, their notes on highlights (a marker after the highlight, plus a "Your notes" list) and the highlights they made inside the questions are shown read-only.
Filters: **All / Wrong / Unanswered** (counted in question numbers) and a **question type** list; the question navigator follows the filter. The teacher's read-only
attempt review (`/teacher/band-conversation/<student>/attempts/<attempt>`) is the same component, so it shows the same.

## Time per part

The exam screens already tell the server where the student is every time they move ("last seen question"). Since Phase M the server also notes when that is **another
part** than the last one recorded (`result_part_events`, one statement, no change to the exam screen). The first row of an attempt is its opening part at its start. Time
in a part = from its row to the next one; the last part ends with the attempt; nothing runs past the time the attempt was allowed. An attempt with no such rows - made
before this existed, or one where the student never changed part - has **no part times** and shows none. They appear on the results page, the review's performance panel,
the teacher's review, and as an average on the student's statistics tab.

## The student's statistics (Band Score Center -> "Results analysis")

Accuracy by question type with the number of questions behind each figure; band progress per module over time (Reading, Listening from the stored bands; Writing = the
teacher's mark, with the AI estimate drawn separately and labelled as an estimate); time per part for the attempts that have it. The older Weakness / Strength trackers on
the Overview tab are unchanged (they count answer rows, so they can differ slightly from these numbers for matching, summary and left-empty questions).

## The teacher's analytics

`/teacher/analytics/results` (and the Analytics sub-navigation): filters for the test, the student, the module and a date range; summary figures, band distribution,
accuracy by question type, the most-missed questions, and one row per student (average band, band trend, weakest question types, latest attempts). The per-test page
(`/teacher/tests/<id>/analytics`) adds accuracy per question and the same sections for that test; a student's page has accuracy by type and a link into the full analysis.
A Root Teacher sees everything, any other teacher only their students - the scope is part of every query, never a filter applied afterwards.

## How it is computed (and why it is fast)

One grouped SQL query adds up the stored marks per question (`results` x `questions`, left-joined to `answers`, grouped by question - and by student for the student table);
what a question is worth and which numbers it covers is worked out on the few hundred question rows involved (`results-math.ts`, pure and checked on its own). Indexes added
for it: `results(studentId, completedAt)`, `results(mockTestId, completedAt)`, `student_profiles(teacherId)`, `questions(mockTestId)`, `highlights(resultId)`,
`notes(resultId)`.

## Screenshots

All taken in real Chrome on the hand-calculated fixture (`docs/screenshots/phase-m/`).

| File | Shows |
| --- | --- |
| `m-evidence-editor.png` | the teacher's evidence page: coverage, the words marked in the passage, "Set as evidence" per question number |
| `m-review-show-in-passage.png` | the student's review: your answer / correct answer / stored verdict per number, the evidence words marked, the student's own highlight and its note marker |
| `m-review-notes.png` | the same review with the student's notes open (read-only) |
| `m-review-filter-wrong.png` | the "Wrong" filter (counted in question numbers) |
| `m-results-part-times.png` | the results page: time in each part (only for attempts that recorded it) |
| `m-student-statistics.png`, `m-student-time-per-part.png` | the student's Results analysis tab: accuracy by type with the count behind each figure, band progress, time per part |
| `m-teacher-analytics.png`, `m-teacher-most-missed.png` | the teacher's analysis of one test: filters, summary, band distribution, the most-missed questions |

## Checks

| Command | What it checks |
| --- | --- |
| `npm run check:results` | no database: evidence (stored, found again after an edit, copied, confirmed-only, the warning), the review's per-number answers and card, part times, and the statistics maths on a hand-calculated example |
| `npm run check:m` | the real database, its own tagged fixtures (removed at the end): the same hand-calculated example through the SQL, evidence end to end, teacher vs Root scope, part events, empty states, and that no stored score moved |
