# Teacher test builder (Phase L1)

The rules every Reading and Listening test goes through, whoever builds it and whichever door they use (by hand, PDF import,
Full Mock quick build). What is still planned for the builder itself is in `docs/backlog.md` ("Phase L2").

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

- Full Mocks, assignments and access codes keep using the old test. To move a Full Mock to the new version, pick it in that Full Mock's
  editor (publish the new version first). Nothing switches by itself.
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

## Checks

| Command | What it checks |
| --- | --- |
| `npm run check:publish` | no database: the validator (39 / 41 questions, gap, missing answer, invalid True/False/Not Given, Listening without audio, a complete test passes), alternatives and the importer, reviews vs stored scores |
| `npm run check:grading` | read-only, real data: every stored answer key still validates and scores itself, and every stored student answer re-grades to the verdict stored at hand-in |
| `npm run check:l1` | real database, its own tagged fixtures (removed at the end): teacher vs Root access to tests, Full Mocks and codes; the validator on stored tests; the edit rule; question ids kept; versions leaving attempts, Full Mock and assignment alone; review vs stored score |
