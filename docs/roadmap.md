# Roadmap

Where the exam engine stands and where it goes next. `docs/backlog.md` holds the detail of what is not built yet;
this page is the map. When a phase ships, move it to "Done".

## Done

| Phase | What it gave the student / teacher |
| --- | --- |
| A | Mock core: one definition of "how many questions", question numbers, grouped tasks (matching, summaries) |
| B | Listening import and the Full Mock builder (PDF in, recording attached, four parts of ten) |
| C | Teacher results monitoring (who sat what, scores, bands) |
| D | Reading exam UX and the highlight engine (offsets that survive paragraph letters, one colour) |
| E | The final Full Mock sitting: Listening, then Reading, then Writing, each started by a button, clocks anchored on the server, the official band table |
| F | Writing Task 1 picture upload (shown above the task text) |
| G0 / G | Stability fixes, then the official computer-delivered **Reading** screen (header, part bar, one footer, contrast and text size, submit dialog, two-screen pre-test) |
| H | **Highlight and notes** on the official screen: right-click menu (Highlight, Notes, Clear, Clear all), notes with markers, touch and keyboard |
| I | The official computer-delivered **Listening** screen: sound check, a recording that plays once by itself and cannot be paused or moved, the screen following it from part to part, 2 minutes to check the answers, then the test is handed in. Same header, footer, question types and highlight / notes menu as Reading |
| J | The official computer-delivered **Writing** screen, for a task taken on its own and inside a Full Mock: task text and Task 1 picture on the left (click to enlarge), a plain answer box on the right with a live word count, Part 1 / Part 2 in the footer. Built so no text is ever lost: a copy in the browser on every keystroke, autosave, retry while offline, an older tab or computer can never overwrite newer text, the clock is counted on the server and hands the writing in when it runs out |

| K | **The Full Mock sitting, server-side expiry and teacher monitoring**: Listening → Reading → Writing with a "Continue" screen between sections (the next clock starts on Continue, or by itself after a wait limit); every timed section has a deadline kept on the server and is handed in by the server when it passes - on any read and from a scheduled job; time used per section and as a sum; words typed while offline reach the teacher as "late text"; a live table of who is sitting what with "End section"; results where Writing waits for the teacher's mark |

| L1 | **Teacher test builder, part 1** (see `docs/test-builder.md`): one access rule (a Root Teacher manages every test, a teacher their own); question numbers and group ranges taken from the student's own numbering; a publish check that refuses an incomplete test with a list of problems (39 or 41 questions, a gap, a missing or invalid answer, a Listening test without audio); reviews that follow the stored score; typed answers with accepted alternatives ("colour / color"); structural edits only on a draft nobody has taken; **Create new version** and **Duplicate**; one test list with filters, a Root view of every author and a Temporary-tests cleanup list; a New test wizard |

## Next

- **Phase L2 - the rest of the test builder**: a structured editor, bulk answer-key paste, Listening part start times, a PDF page as the
  Writing Task 1 picture, and "Preview as student" (see the backlog).
- **Phase N - practice mode**: hints and warnings that the exam screens deliberately do not have (for Writing: the
  minimum-length and word-count notices; the exam screen never blocks or warns).
- **Listening follow-ups**: part switching with one shared recording needs a start time per part (see the backlog).
- **Retire the legacy screens** (`NEXT_PUBLIC_EXAM_UI=legacy`, `?ui=legacy`) after a release cycle on the official ones.
- **Notes after the test**: show a student's highlight notes on the review page and the teacher's result page.

## How a Listening sitting runs (Phase I)

1. Confirm your details, then the **sound check** (a short sample and a volume slider), then the instructions.
   "Start test" is live only when the recordings are loaded completely; it starts the clock (`Result.startedAt`).
2. The recording starts by itself and plays once, from the first recording to the last. There is no player: only the
   volume (top right) can be changed. When each part has its own recording the screen moves to the next part when the
   recording does; the numbers at the bottom still lead back to any earlier part.
3. When the last recording ends, the header reads "2 minutes left to check your answers"; at zero the test is handed in.
   A test with no time limit is never handed in by itself.
4. A reload carries on from where the server's clock says the recording is; a page opened after the end goes straight
   to the review time, or hands the test in.
5. Inside a Full Mock the sitting begins with the same sound check on the start card, and the end of Listening moves
   on to "Start Reading" as before.

## How a Writing sitting runs (Phase J)

1. A task taken on its own: confirm your details, then the instructions; "Start test" opens the sitting. It creates the
   student's draft and writes the moment into `writing_submissions.startedAt` - the server's own start, which the clock is
   counted from (20 minutes for Task 1, 40 for Task 2). In a Full Mock the start card's "Start Writing" button does the same
   for the one 60-minute clock (`FullMockAttempt.writingStartedAt`); Part 1 and Part 2 are its two tasks.
2. The screen: header with the time left, a part bar ("Part 1 - You should spend about 20 minutes on this task. Write at least
   150 words."; the sentences come from the stored task text when it has them), the task text and Task 1 picture on the left,
   the answer box on the right, "Word count: N" under it, Part 1 | Part 2 in the footer (filled once there is text),
   previous / next, and the tick that hands the writing in. No spell check, no suggestions, no minimum length, no warnings.
3. **One word counter** (`src/lib/writing/word-count.ts`) for the screen and for the server, which stores the count with every
   draft and with the handed-in essay: split on whitespace, ignore empty pieces; "well-known" is one word, numbers and lone
   symbols count.
4. **Nothing typed is lost.** Every keystroke is written to the browser's own storage first. The text goes to the server 2 s
   after the last key (at least every 10 s while typing), when the box loses focus, when the part changes and when the tab is
   hidden; a failed save is retried with growing pauses and the status says "Not saved yet - reconnecting"; a save that gets
   no answer for 25 s counts as failed. Opening the screen again puts back text that never reached the server.
   Closing or reloading with unsaved text asks first.
5. **An older window can never overwrite newer text.** A draft's `updatedAt` is its version; every save and every hand-in says
   which version it is based on and is refused when the draft has moved on. Another tab of the same browser is noticed at
   once (BroadcastChannel); another computer is caught by the server. The older window stops, keeps what was typed in it
   where it can be copied out, and offers "Load the newest text".
6. **When the time is up** the latest text is saved and both parts are handed in without a click; if the connection is down it
   keeps trying (the text stays in the browser). A hand-in that reaches the server more than 90 seconds after the end uses the
   draft saved in time. An answer that is empty is handed in as it is: stored empty, band 0, shown to the teacher as
   "No response". A draft begun on the old screen has no start time, so it has no clock: "Untimed", never handed in by itself.
7. Highlight and notes work on the task text (the same right-click menu as Reading and Listening); they are kept in the browser
   for this sitting. The old screens stay behind `NEXT_PUBLIC_EXAM_UI=legacy` / `?ui=legacy`.

## How a Full Mock sitting runs (Phase K)

1. **Start.** The student enters the access code, then the start card shows **Confirm your details** (their name and the test), the sound
   check and the instructions. "Start Full Mock" opens the sitting (`FullMockAttempt`) and Listening begins. One active sitting per student
   per mock, even if the button is pressed twice.
2. **Listening → Reading → Writing**, each on its own official screen with its own clock, each deadline kept on the server
   (see `docs/server-expiry.md`): Listening = the recording + 2 minutes, Reading 60 minutes, Writing 60 minutes.
3. **Between sections** a screen says "Listening finished" / "Reading finished" with a **Continue** button. The next clock starts on
   Continue. If the student does not press it within the mock's wait limit (5 minutes by default,
   `FullMockTest.transitionLimitMinutes`) the server starts the next section by itself - counted from the end of the wait, not from when
   the student came back. A finished section never reopens; a student who comes back lands on the right screen (the running section, the
   Continue screen, or the results).
4. **When a section's time passes** and nobody hands it in, the server does it: scored with the saved answers, "time expired", the sitting
   moves on. A browser that was closed mid-Reading finds its Reading handed in at the deadline.
5. **The teacher's Live Monitor** (`/teacher/mock-monitor`) shows each sitting: section, status (not started / in progress /
   submitted / expired), answers counted out of 40 (Writing: words), the time left on the server's clock, and when the work was last saved
   (the last autosave, not a heartbeat). It refreshes by itself every 20 seconds. **End section** (with a confirmation) hands the student's
   running section in like an expiry, marked "ended by the teacher". A normal teacher sees their own students and the sittings of their own
   mocks; a Root Teacher sees everyone.
6. **Time used** is per section, `min(end - start, the section's time)`; the Full Mock total is the sum of its sections.
7. **Writing and the teacher.** Both Writing tasks wait for the teacher's mark: until then the results say "Awaiting teacher review"
   and there is no combined figure (the AI estimate is feedback, not a band). Once both are marked the Writing band is
   (Task 1 + 2 x Task 2) / 3 and the combined figure, labelled **Overall (L/R/W, unofficial)**, is the mean of Listening, Reading and
   Writing rounded to the nearest half band (6.25 → 6.5, 6.75 → 7.0, 6.125 → 6.0). The teacher's table shows the same numbers.
8. **Late text.** If the connection was down when Writing ended, the server hands in the last saved draft. When the browser is back online
   the words it still holds are uploaded as *late text*, linked to the submission with the moment the browser last held them. The
   submission is never changed; the teacher's review page shows "Late text available (not part of the submission)" and can read it.
9. **Access codes** keep their rules (expiry date, number of students, active / inactive, assigned student, the teacher who issued them);
   a code that is used up, expired or switched off gives the same two messages as before. Draft and temporary ("_...") Full Mocks are never
   listed for students.
