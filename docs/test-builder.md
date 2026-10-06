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
  with it. A "choose TWO" question is one numbered question.
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
  **Preview as student** shows them as the two parts of one paper. A student still sits each task on its own screen (Task 1 with its 20 minutes, Task 2 with 40),
  exactly as before: the two-part screen under one clock exists inside a Full Mock only, and the exam screens were not changed in this phase.
- **Task 1's picture can be one page of a PDF** (`src/lib/writing-pdf-visual.ts`): the teacher uploads the PDF, sees a thumbnail of each page, chooses the page
  and sees it as it will be saved. The page is rendered on the server with **PDFium compiled to WebAssembly** (`@hyzyla/pdfium`) and encoded with `sharp` -
  no poppler or system binary, so it runs on serverless. It is stored as a PNG exactly like any other task picture (Media Library file, `imageUrl`,
  `imageType`, `imageWidth`, `imageHeight`), so **the student's screen still draws a picture only**. The original PDF is kept in its own bucket
  (`writing-task-pdfs`) as `WritingTask.visualPdfUrl` with the chosen page in `visualPdfPage`. Limits: the PDF at most 10 MB and 40 pages; a page is drawn at most 1800 px wide and 2000 px tall (the Media Library keeps every picture's longest side at 2000 px, so the size the page picker shows is the size that is saved).
  `next.config.ts` lists the package as an external server package and traces its `.wasm` file into the serverless bundle.

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
| `npm run tests:validate` | read-only: what the publish rules say about every test already in the database |
| `npm run check:publish` | no database: the validator (39 / 41 questions, gap, missing answer, invalid True/False/Not Given, Listening without audio, a complete test passes), alternatives and the importer, reviews vs stored scores |
| `npm run check:grading` | read-only, real data: every stored answer key still validates and scores itself, and every stored student answer re-grades to the verdict stored at hand-in |
| `npm run check:l1` | real database, its own tagged fixtures (removed at the end): teacher vs Root access to tests, Full Mocks and codes; the validator on stored tests; the edit rule; question ids kept; versions leaving attempts, Full Mock and assignment alone; review vs stored score |
