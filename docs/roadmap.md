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

## Next

- **Phase L - teacher preview**: "Preview as student" on a test (see the backlog).
- **Writing screen** in the same official style.
- **Listening follow-ups**: part switching with one shared recording needs a start time per part; the recording's
  length stored when the audio is uploaded (see the backlog).
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
