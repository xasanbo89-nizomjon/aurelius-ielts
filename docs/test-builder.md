# Teacher test builder (Phases L1 and L2)

The rules every Reading and Listening test goes through, whoever builds it and whichever door they use (by hand, PDF import,
Full Mock quick build), and - from "The structured editor" on - what Phase L2 added on top of them. Anything not built yet is in
`docs/backlog.md`.

## Who may do what

One rule, in `src/lib/exam/test-access.ts`, used by every function that reads or changes a test, a Full Mock or an access code:

| Who | Sees and manages |
| --- | --- |
| Root Teacher (`TeacherProfile.isRootTeacher`, read from the database on every call) | every test, Full Mock and access code on the platform |
| Any other teacher | only what they created (`createdById`) |

Nothing else compares `createdById` to the signed-in teacher. A new version made by a Root Teacher stays with the author of the
test it replaces (their band table, their lists); a duplicate belongs to whoever made it.

## Question numbers

There is one numbering, the student's own `numberQuestions` (`src/lib/exam/question-numbering.ts`): rows in `orderIndex` order,
a matching row takes one number per heading, a summary one per `{{n}}` blank. The editor, the validator and the question counts
all use it; nothing computes numbers separately.

A question group's range and title ("Questions 14-18") are **derived** from its rows (`syncGroupRanges`) every time questions or
groups are added, changed, moved or deleted. Nobody types them. Tests saved before this phase were not rewritten; the publish
check reports a group whose stored range disagrees with its rows, and saving any change in that test (or moving a group) puts it right.

## Publishing

`setPublished(id, teacher, true)` runs `validateTestForPublish` on the stored rows (`src/lib/exam/test-validation.ts` is the pure
rule set, `test-publish.ts` loads the rows). A test goes live only when:

- it has the right number of parts (Reading 3, Listening 4) and every part has text (a Listening part: a recording whose length is known);
- the numbers run 1-40 with no gap, no repeat and no 39 or 41, parts in order;
- every question group has instructions, and every question has a prompt (where its type needs one) and a **valid answer**
  (True / False / Not Given is one of the three, a choice is one of the choices, a typed answer is not empty, every matching heading and
  summary blank has an answer, a summary has its `{{n}}` markers);
- the teacher's count, the student's count (`getQuestionNumberCount`) and 40 agree.

A test that is not ready answers with **every** problem at once, each in the numbers the student sees ("Question 17: no answer")
and each with a link to the question or part. The publish button opens that list.

## Editing, and what is locked

Structural edits (passages, recordings, attachments, groups, questions, the answer key, the time limit and category) are allowed only
on a test that is a draft, has never been attempted and is not inside a published Full Mock (`src/lib/exam/test-lock.ts`). The
title, description and cover image stay editable at any time. A locked test shows why, and offers **Create new version**.

- Editing a draft **updates rows by id**: it never deletes and recreates a question, so question ids (and anything pointing at them) survive.
- **Unpublish** works only while the test has no attempts. A test with attempts is retired with **Archive** (hidden from students,
  results kept).
- Deleting a test with attempts still asks for a separate confirmation (unchanged).

## Versions

**Create new version** (`src/lib/exam/test-versions.ts`) copies a test into a new **draft** with new ids for the test, passages,
groups, attachments and questions, and remembers its source (`versionOfId`). **Duplicate** is the same copy with no link back.

- A new version **keeps the title** of the test it replaces: students never see "(new version)". Teachers tell versions apart as **v1, v2, v3**
  (`src/lib/exam/version-numbers.ts`, counted along `versionOfId`), in the Tests list, on the test's page, in the Full Mock picker and on the
  Assignments page. A **duplicate** is a separate test and is titled "(copy)".
- Full Mocks, assignments and access codes keep using the old test until a teacher switches them on purpose - nothing switches by itself:
  - **Use newest version**: a button ("Use v2") in the Full Mock's Reading / Listening step and on each open assignment, shown only when a newer
    version is published. Access codes belong to a Full Mock, so they follow it.
  - **Publishing a new version** asks "Archive previous version (v1)" (ticked by default). Archiving hides v1 from students; its attempts and results
    stay. An archived test cannot be started or resumed, so before archiving, the Full Mocks and not-yet-handed-in assignments that still use v1 are
    moved to the new version (the dialog says so), and v1 is **not** archived while a student is in the middle of it or anything that uses it could
    not be moved: the publish itself always goes ahead, and the message says why v1 stayed. Finished assignments stay on the version they were done on.
- Every attempt stays on the test it was taken on; the copy starts with none.
- Uploaded files (recording, images, cover) are shared by reference; the storage cleanup only removes a file nothing points at.
- The test's page lists its versions and what still uses it.

## Typed answers with alternatives

Sentence completion, fill in the blank, short answer and each summary blank accept either one answer (a string, exactly as before)
or a list of accepted alternatives. The PDF importer keeps every `/` alternative from an answer key ("colour / color" becomes two
accepted answers; "24/7" and "1/2" stay whole). The editors show and accept "colour / color". Scoring did not change:
`npm run check:grading` re-grades every stored student answer in the database and compares it with the verdict stored at hand-in.

## Reviews follow the stored score

A review page uses the verdict stored when the attempt was handed in (`Answer.isCorrect`, `pointsAwarded`). Only an old row without
a stored verdict is worked out from the answer key. A key edited after the attempt can no longer make a review disagree with the score.

## The test list

`/teacher/tests`: one **New test** button (a wizard: Reading / Listening / Full Mock / Writing, then how: by hand, PDF import,
assemble, build from files - each goes to the editor that already exists), search, filters (type, status, level) and, for a Root
Teacher, an author filter and an author column. Counts are real queries: the student's question count and the number of attempts.
A Root Teacher also sees **Temporary tests**: every test or Full Mock whose title starts with `_`, for review and deletion.
Writing tasks are managed under Writing.

## The structured editor (Phase L2)

A draft Reading or Listening test opens in one page (`src/components/teacher/test-builder/`): its parts, and in each part its question groups and questions,
held in memory as a model (`src/lib/exam/builder-model.ts`). A published test, a test with attempts and a test inside a published Full Mock still open
read-only, exactly as in L1 (`getTestEditState`).

- **Numbers are never typed.** The editor works out every number with the student's own `numberQuestions`; a group's range ("Questions 14-17") and title
  are derived from its rows when it is saved. Moving a group or a question changes the stored `orderIndex` of the rows, so the student's order changes
  with it. A "Choose TWO" question covers two numbers (Phase L3, below).
- **Every Reading and Listening type**: multiple choice (one answer, or "more than one correct answer"), True / False / Not Given, Yes / No / Not Given,
  matching headings, matching (features, endings), summary / note / table completion, form / sentence completion, short answer, map / plan / diagram
  labelling. **Insert blank** puts a `{{}}` at the caret; each is one answer box and one numbered question, numbered on save.
- **Accepted alternatives** are typed as in L1 ("colour / color", "(the) library").
- **Student view**: each group can draw itself the way the student's screen will; **Preview as student** opens the real exam screen (below).
- **Autosave** (`saveBuilder`, `src/lib/exam/test-builder.ts`): one transaction. Rows are **upserted by id** (a bulk `INSERT ... ON CONFLICT (id) DO UPDATE`
  that skips unchanged rows), ids sent by the browser are checked to belong to this very test, and only rows missing from the model are deleted. The
  token is `mock_tests.updatedAt`: if the test changed elsewhere (another tab, another teacher, the cover image) the save is refused as a **conflict**
  and nothing is overwritten; if the test became locked it is refused as **locked**. Leaving the page with unsaved changes asks first.
- **Checklist** (right side): the live `validateTestStructure` result - how many numbers, what each part has, every problem with a link to it. Publish
  runs the same rules on the stored rows (`validateTestForPublish`).
- **Paste answer key** (`src/lib/exam/answer-key-paste.ts`): paste "1 B, 2 TRUE, 3 colour/color ..." (or one per line, a column, "1. B"), see a table of
  question -> type -> parsed answer, with answers that do not fit marked red and explained; nothing is written until **Apply**, and only the clean answers are
  applied. Numbers mean the student's numbers **at the moment of pasting** (after a reorder, too).
- **Importer**: every spelling of a numbered gap (dotted `......`, `. . . .`, underscores, ellipsis, dashes, with or without the number, "(14)", "14.")
  becomes a `{{n}}` marker, and the validator refuses a completion whose boxes, numbers and answers disagree ("Questions 37-39: writes its blanks as
  dotted lines ..."). `npm run tests:validate` reports it for every stored test (read-only).

## Listening recording and part times (Phase L2)

- **One way to upload**: the signed direct upload for every recording (browser -> storage, nothing large goes through the app). The recording's length is
  measured on the server when it is attached. `Passage.audioUrl` (old uploads) is still read as a fallback.
- **One recording for the whole test** (the normal case) is attached to every part. The teacher then says where Parts 2, 3 and 4 start: type `m:ss`, or play the
  recording in the small player, stop, and press **Set to current position**. They are stored in `passages.audioStartSeconds`.
- The student's screen **follows those times by itself** (`sharedPartStarts` / `partAtSeconds` in `src/lib/exam/listening-audio.ts`): Part 2 appears when the
  recording reaches its start time, and so on. It still lets the student turn parts by hand. **No start times = the old behaviour** (the student turns the
  parts); a test whose parts each have their own recording is unchanged.
- The validator refuses start times that do not increase, that run past the end of the recording, or that are only partly filled in.

## Writing tests and the PDF picture (Phase L2)

- The New test wizard's **Writing** step offers **Task 1 + Task 2 together** (a Writing test) and the existing task bank (`/teacher/writing`) - one place for
  Writing tasks, not a second copy. A Writing test is two `WritingTask` rows that share a `bundleId`; the bank shows them with a "Writing test" chip, and
  **Preview as student** shows them as the two parts of one paper. (From Phase L3 a student sits them as one paper too - see "A Writing test is one sitting" below.)
- **Task 1's picture can be one page of a PDF** (`src/lib/writing-pdf-visual.ts`): the teacher uploads the PDF, sees a thumbnail of each page, chooses the page
  and sees it as it will be saved. The page is rendered on the server with **PDFium compiled to WebAssembly** (`@hyzyla/pdfium`) and encoded with `sharp` -
  no poppler or system binary, so it runs on serverless. It is stored as a PNG exactly like any other task picture (Media Library file, `imageUrl`,
  `imageType`, `imageWidth`, `imageHeight`), so **the student's screen still draws a picture only**. The original PDF is kept in its own bucket
  (`writing-task-pdfs`) as `WritingTask.visualPdfUrl` with the chosen page in `visualPdfPage`. Limits: the PDF at most 10 MB and 40 pages; a page is drawn at most 1800 px wide and 2000 px tall (the Media Library keeps every picture's longest side at 2000 px, so the size the page picker shows is the size that is saved).
  `next.config.ts` lists the package as an external server package and traces its `.wasm` file into the serverless bundle.

## "Choose TWO" covers two numbers (Phase L3)

In IELTS a "Choose TWO letters" question takes **two question numbers** (21 and 22), each worth one mark, and the marks are given **per correct letter, in any
order**. One definition (`src/lib/exam/choose-many.ts`) is read by everything that cares:

- **Stored**: a multiple-choice row with `options.allowMultiple: true` and `options.chooseCount` (2 or more); its key has that many letters, it is worth that many
  points. A multiple-choice row **without** `chooseCount` is exactly what it always was: one number, all-or-nothing (no stored question or answer used choose-TWO
  when this was changed, so no stored score moved; `npm run check:grading` re-grades every stored answer and agrees).
- **Numbering** (`numberQuestions`): the row spans `chooseCount` numbers, so 40 numbers are still 40 (the editor, the validator, the student's count, the teacher's count).
- **Scoring** (`grading.ts`): 2 letters right = 2 marks, 1 right = 1 mark, none = 0, whatever the order. More letters than allowed, or a letter twice, earns nothing
  (the screens do not allow it: once N letters are ticked the other boxes are off). The stored verdict is `isCorrect` (all right) and `pointsAwarded` (0 / 1 / 2).
- **Review and results** (`evaluateSlots`): the row's numbers show how many were right (the stored marks decide, as for matching and summaries): "Questions 21-22,
  1/2 correct"; the "x of 40" totals add up to the raw score.
- **Editor**: ticking "More than one correct answer" asks how many letters (TWO, THREE, FOUR); each question then shows its range (1-2, 3-4) and the group's range
  follows; ticking more correct letters than the question asks for is not possible; the checklist says "Choose TWO needs 2 correct letters; 1 chosen".
- **Student screens** (official and older): the question shows both numbers, the footer has a button for each number (answered after one letter / after two),
  and no more than N boxes can be ticked.
- **Paste answer key**: "1 A 2 D", "1-2 A, D", "1&2 A D" and "1 A, D" (one question per line) all fill the same question; the table has one row per question
  ("21-22"), and the wrong number of letters is a mismatch.

## Tables are real tables (Phase L3)

Table completion is stored like every summary-style question (one row, `{{n}}` blanks, scored per blank) with `options.layout: "table"`. Both exam screens and the
preview then **always draw it as a table** (`src/lib/exam/table-text.ts`): the lines with `|` are the rows, a short row is padded, a line before the first row is the
table's **title** (a caption), a line after the last row is a **note** under it, a line without cells between rows is a heading across the table. The answer boxes
sit inside the cells. A table written without the flag (older tests, imports) is recognised only when every line is a row of the same width - exactly as before.

The editor builds a table as a **grid** (`table-grid-editor.tsx`, logic in `src/lib/exam/table-grid.ts`): the first row is the header, **Insert blank** puts an answer
box in the cell the teacher is in, rows and columns can be added and removed, and cells copied from a spreadsheet or a document table can be pasted. Every blank keeps
its own answers when rows, columns or cells change. The teacher never types a `|` or a `{{ }}`.

## A Writing test is one sitting (Phase L3)

When **both tasks of a Writing test are assigned to a student** (and neither is written for a Full Mock), the student sits them as one paper
(`src/lib/writing-bundle-sitting.ts`): one start screen (60 minutes, Part 1 and Part 2), **one 60-minute clock counted on the server**, the official two-part footer,
and one hand-in for both parts (the tick, or the clock reaching zero), exactly like the Writing paper of a Full Mock but with no Full Mock around it.

- The sitting is its two draft submissions: "Start test" creates both with the same `startedAt`; opening either task goes back to the same sitting. No schema change:
  the pair is the tasks' `bundleId`.
- Saves name the draft version they were typed on (an older window is refused, `conflict`); a hand-in with a window that is behind hands in **nothing** and says which
  part is behind; text typed after the hour (+ the 90 s grace) is not part of the submission (it is kept as late text); a part with no text is handed in blank.
- The scheduled job (`/api/cron/finalize-expired`) and `npm run attempts:finalize-expired` (dry run by default) hand in a sitting whose hour is over with the saved
  drafts; the single-task job leaves Writing test drafts alone (it would use 20 / 40 minutes).
- **A single task - or a Writing test task whose partner is not assigned - is sat on its own as before** (20 minutes for Task 1, 40 for Task 2, its own screen).
- Each part is still marked and reported as its own submission.

## Who manages Writing tasks (Phase L3)

The Writing task bank follows the same rule as tests (`src/lib/exam/test-access.ts`): a teacher sees and manages the tasks they made; a **Root Teacher sees and manages
every teacher's** (each task says who made it): edit, assign any real student, publish, archive, delete. A task still belongs to its author. When a Root Teacher
saves another teacher's Task 1 the picture it has stays as it is.

## Preview as student (Phase L2)

`/teacher/preview/<testId>` (Reading or Listening, draft or published) and `/teacher/preview/writing/<taskId>` open the **real** exam screens (the same
`ExamRunner` / official screens the student gets) under a "Preview" banner with an **Exit preview** button. A preview writes nothing: the exam's only
connections to the server (save an answer, save a highlight or note, ping study time, hand in, start the clock) go through `ExamActions`
(`src/components/exam/exam-actions.tsx`), a context that supplies the real server actions to a student and no-ops to a preview; the Writing screen already
took its save / hand-in functions as props. No attempt, answer, highlight, note, bookmark, submission, study activity, streak or Full Mock row is created -
the browser run counts all of them before and after. Only the owner (or the Root Teacher) can preview a test.

## Not found means 404 (Phase L2)

A page with a `loading.tsx` streams, so its status line is sent before the page runs and `notFound()` inside it answered 200. `src/lib/route-guard.ts` is
called from the teacher, student and exam **layouts** (which render before those loading boundaries): for the routes that address one record
(tests, Full Mocks, imports, articles, students, writing reviews, exam attempts and results, Full Mock sittings, the speaking and library items) it asks, with
the access rule the page itself uses, whether the record exists for this person, and calls `notFound()` while the status can still be 404. Middleware sets
the `x-pathname` header the guard reads. A database error in a guard never becomes a 404 (the page decides). The page keeps its own check; a guard grants
nothing. A new detail route with a `loading.tsx` needs a rule in that file.

## Checks

| Command | What it checks |
| --- | --- |
| `npm run check:builder` | no database: the editor's model (every type -> rows -> the student's numbers), the answer-key paste, the start-time rules and part switching |
| `npm run check:choose` | no database: "Choose TWO" - numbering, 0 / 1 / 2 marks in any order, review, validator, editor round trip, key paste |
| `npm run check:tables` | no database: tables - reading a title / note / short row, the grid's row and column operations, storage, scoring, and both exam screens drawn to HTML |
| `npm run tests:validate` | read-only: what the publish rules say about every test already in the database |
| `npm run check:publish` | no database: the validator (39 / 41 questions, gap, missing answer, invalid True/False/Not Given, Listening without audio, a complete test passes), alternatives and the importer, reviews vs stored scores |
| `npm run check:grading` | read-only, real data: every stored answer key still validates and scores itself, and every stored student answer re-grades to the verdict stored at hand-in |
| `npm run check:l1` | real database, its own tagged fixtures (removed at the end): teacher vs Root access to tests, Full Mocks and codes; the validator on stored tests; the edit rule; question ids kept; versions leaving attempts, Full Mock and assignment alone; review vs stored score |
