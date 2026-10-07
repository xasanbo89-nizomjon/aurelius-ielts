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

## After handing in, and the review (Reading and Listening) - Phase M2

Only when the student may see their results (Phase O will add the case where they may not: the one place to change is `/student/exam/attempt/<id>/review` and the
redirect in `submitAttemptAction`). Nothing here changes how a test is sat, timed or scored; everything shown is the verdict stored when the attempt was handed in.

1. **Submit.** The official Reading and Listening screens show **"Checking your answers…"** over everything while the test is handed in (not inside a Full Mock, which
   marks nothing between papers, and not in a teacher's preview). Then the review opens at `/student/exam/attempt/<id>/review?results=1`.
2. **The results dialog.** Band score, raw score (27/40) and a table **# | Your answer | Correct answer**, one row per question number - green when right, red when
   wrong or left empty (the stored verdict; a left-empty number shows "—"). A "Choose TWO" is two numbers: the right letters the student picked show on both sides of
   a green row, a wrong letter is set against the right letter that was missed. **Close** leaves the dialog (and drops `?results=1`, so a reload does not open it
   again); **Results** in the header opens it again; **Full results page** is the older page (accuracy by part and type, strong and weak areas).
3. **Review mode** is the official exam layout, read-only: the same header (with **Band score: X** where the clock was, and the contrast / text-size menu), part bar,
   split screen, question rows (every question type, "Choose TWO", matching, tables, summaries, gap fill - the same components as the exam, in a read-only mode) and
   footer. Every question number is a green or red box with a tick or cross and **Answer: ...** (accepted alternatives included, "colour / color"); what the student
   picked or typed stays visible and the controls are disabled. The footer's numbers are green (right) or red (wrong or left empty) with a tick or cross; a closed part
   reads "Part 2  5 of 12".
4. **The passage (Listening: the transcript).** The words a teacher **confirmed** as evidence are light green with a thick underline and a small **[n]** badge at the
   start. Pressing a question (its number, its text, its answer) scrolls the passage to its evidence and marks it as the one in focus; pressing a badge scrolls to the
   question. The student's own yellow highlights, their notes (a marker after the highlight; "Your notes" under the text) and the highlights they made inside the questions
   are drawn as they were made. Green evidence and yellow highlights differ by colour, by the underline and the badge, and stay different in all three contrast settings;
   where they overlap the highlight shows yellow with the evidence's underline.
5. **Explain more / What's the trap?** Next to the answer of every question that has an approved explanation (once, under the row, for a question that covers several
   numbers). A popover with the note "Auto-generated explanation — may not be fully accurate."; "The trap" and "The fix" in the second. A question with none (not written,
   a draft, or outdated) shows no buttons. **No student ever triggers an AI call**: the review makes no request that writes anything.
6. **Filters** (in the part bar, as before): All / Wrong / Unanswered counted in question numbers, and a question-type list. Rows that do not match are hidden, their
   numbers are dimmed in the footer, and the screen moves to a part that has something to show.

The teacher's read-only attempt review (`/teacher/band-conversation/<student>/attempts/<attempt>`) still uses the Phase M split page. The Phase M review components
(`src/components/exam/review/`) are kept for it.

## Explanations (Phase M2)

`/teacher/tests/<id>/explanations` (a button on the test page: "Explanations (approved/all)"). Like evidence, it works on any test the teacher manages - published, or
already taken - because it changes no question, answer or score.

- **Stored once per question** (`question_explanations`: explanation, the trap, the fix, status DRAFT / APPROVED, the model, who approved and when). Students see only an
  **APPROVED** one that **still matches its question**: it keeps the hash of the question's type, wording, options and right answer(s) as they were when it was written,
  and a question edited since shows it as **Outdated** (hidden from students, listed for the teacher, not approvable until written again).
- **A new version or a duplicate copies the explanations** with the questions; the copy shows them for exactly as long as the question and its answer stay the same -
  change the answer key in the new version and that question's old explanation is hidden, the others stay.
- **Generate with AI** (off until the teacher switches it on for themselves; `ai_settings.explanationsEnabled`; a daily limit per teacher,
  `dailyExplanationAiLimit`, default 60, counted from `explanation_generation_logs`). "Generate explanations for all questions" asks once per question that has none (or an
  outdated one), one after the other, and stops at the limit; every result is a **draft**. The model sees the passage / transcript, the question, its options, the right
  answer(s) and the confirmed evidence; the reply is a JSON schema with three fields; low temperature (0.2).
- **Review:** per question **Edit** (three text boxes, "Save and approve" / "Save as draft"), **Regenerate** (one more request; the question becomes a draft), **Approve**,
  **Take back** (an approved one becomes a draft) and **Remove**; **Approve all** approves every draft that still matches.
- **Root Teacher:** the explanations page shows the token usage of the explanation writer for all teachers (today / 30 days / all time) and the model, and the Root's
  AI usage page (`/teacher/analytics/health`, "OpenAI Usage") lists the same figures in a **Stored explanations** table. Both read the durable
  `explanation_generation_logs` (a restart does not reset them, unlike the in-memory table above it, which only sees calls made in the same server process).
- **Environment variables:** `OPENAI_API_KEY` (as for every AI feature); **`OPENAI_EXPLANATION_MODEL`** (optional) - the model for explanations; when unset the app's
  `OPENAI_MODEL` is used (default gpt-4o-mini).
- **Retired:** the per-student "Explain More" button (which asked the AI on every click, at the student's cost to the platform) is no longer on the student's screens: the
  review has the stored popovers instead, and a wrong answer on the older results page links to the review. The server functions behind it are still in the code.

## Answer evidence in bulk (Phase M2)

On the evidence page, with "Suggest with AI" switched on: **Suggest evidence for all questions** asks once for every question number that has neither evidence nor a
suggestion (not for a Not Given statement), one after the other, with a progress line and a Stop button, and stops at the daily limit. The suggestions are listed under
**AI suggestions to review**: **Confirm**, **Edit** (takes the number to its passage so the right words can be selected and set) or **Reject** each, or **Confirm all**.
An unconfirmed suggestion is never shown to a student.

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

### Phase M2 screenshots (`docs/screenshots/phase-m2/`)

| File | Shows |
| --- | --- |
| `m2-results-dialog.png`, `x-dialog.png` | the results dialog right after hand-in: band, raw score, # / Your answer / Correct answer, green and red rows |
| `m2-review-part1.png`, `m2-review-part2.png`, `x-review-1.png`, `x-review-2.png` | review in the official layout: header "Band score", green / red footer numbers, ticks, "Answer: ...", evidence with [n] badges, the student's yellow highlight |
| `m2-checking.png`, `m2-submit-dialog.png`, `m2-submit-review.png` | a real hand-in on the exam screen: "Checking your answers…", the results dialog, then review mode after Close |
| `m2-final-explain.png` | "Explain more" open on a question with an approved explanation |
| `m2-review-filter-wrong.png` | the "Wrong" filter: other rows hidden, footer numbers dimmed |
| `m2-review-listening.png` | Listening review: the same colours and answers, evidence in the transcript |
| `m2-review-phone.png` | the review on a phone: Questions / Passage tabs, short header |
| `m2-explain-popover.png`, `m2-trap-popover.png` | "Explain more" and "What's the trap?" with the auto-generated note |
| `m2-contrast-black-on-white.png`, `m2-contrast-white-on-black.png`, `m2-contrast-yellow-on-black.png` | evidence and the student's highlight stay distinct in the three contrast settings |
| `m2-evidence-bulk.png` | the teacher's list of suggested evidence: Confirm / Edit / Reject per question, Confirm all |
| `m2-explanations-editor.png` | the teacher's explanations page: generate for all, Edit / Regenerate / Approve per question, Approve all |

## Checks

| Command | What it checks |
| --- | --- |
| `npm run check:m2` | no database first: the review model (stored verdicts, Yes / No wording, "Choose TWO" number by number, filters); then the real database with its own fixtures: the explanation lifecycle (draft / approved / outdated), who may write them, what a student gets, copy with a version, the AI rules **without calling the model**, token usage, and that no stored score moved |
| `npm run check:results` | no database: evidence (stored, found again after an edit, copied, confirmed-only, the warning), the review's per-number answers and card, part times, and the statistics maths on a hand-calculated example |
| `npm run check:m` | the real database, its own tagged fixtures (removed at the end): the same hand-calculated example through the SQL, evidence end to end, teacher vs Root scope, part events, empty states, and that no stored score moved |
