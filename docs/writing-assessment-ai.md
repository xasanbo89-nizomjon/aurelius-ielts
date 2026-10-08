# Phase O - AI Writing assessment, result visibility, Students' Scores

## 1. Show results to students?

* Every Reading, Listening and Writing test carries the teacher's **required** Yes / No (`mock_tests.showResultsToStudent`, `writing_tasks.showResultsToStudent`; a Writing test's two tasks always share one answer). It is asked in: New test form, PDF import confirm step, Writing test form, Writing task editor. A test cannot be published without an answer. The answer can be changed **any time** (also after students sat the test) from the test page or the Writing task list.
* **Older tests keep their behaviour:** no answer (NULL) = results shown. Nothing was changed in existing rows.
* **No** = the student sees only "Your test has been submitted." - no band, raw score, percentage, right/wrong, review, explanations, AI summary, statistic, notification or list value. Teachers see everything.
* **Full Mock = always hidden** from students (every section result, the Writing assessment, the Mock Exams page, the old results page - which now only says "submitted"). Only teachers see Full Mock bands (Students' Scores, Full Mock results tables).
* Enforced on the server in `src/lib/exam/result-visibility.ts` (+ `-rules.ts`): `resultShownToStudentWhere` / `writingShownToStudentWhere` (Prisma), `RESULT_SHOWN_SQL` / `WRITING_SHOWN_SQL` (raw SQL), `getResultVisibility`, `getWritingVisibility`. Student-facing readers take an `audience` argument that **defaults to "student"**; teacher screens pass `"teacher"`. `npm run check:o` checks that each reader applies the rule.
* Flipping a test to No also deletes the students' cached AI summaries (Mistake analysis, Improvement plan, Motivation) for the students who took it.

## 2. AI Writing assessment

* Runs automatically after a Writing hand-in (Writing test, single task, Full Mock). The hand-in only **queues** one `writing_assessments` row per sitting (idempotent); the worker runs in the background (`after()`), the sweeper in the cron jobs, and any page/status request that sees it stuck restarts it. Status PENDING -> PROCESSING (5 min lease) -> DONE / FAILED; **Try again** (student if the result is shown to them, teacher, Root) re-runs the same essays and only the task that failed.
* Per task one model call (Task 1 **with the picture**, shrunk to <= 2000 px PNG and sent as an image), strict JSON-schema output, temperature 0.2, zod check, every quoted mistake must be in the essay, **one retry**. Criteria: Task Achievement / Task Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy, marked against the public band descriptors in the prompt.
* Task band = mean of the 4 criteria, nearest half band (x.25 and x.75 round up). **Writing = (Task 1 + 2 x Task 2) / 3**, nearest half band. A teacher's own mark of an essay stands in front of the AI band. An empty task is band 0 (no AI call). **Under-length:** Task Achievement/Response is capped (<10% of the minimum: 2, <50%: 4, <70%: 5, <90%: 6) and the report says so.
* Report: per-criterion comments, mistakes quoting the student's words with the correction, vocabulary suggestions, strengths, what to improve - always "AI estimate - not an official IELTS score". The older per-essay analysis rows are written from the same report (no second call) so the Writing Center, Mistake Center and rewrite tools keep working.
* **Daily limit** (Root, `platform_settings` key `writing.dailyAssessmentLimit`, default 10 sittings per student per day, Tashkent time). It never stops a hand-in: the later sitting waits (FAILED / LIMIT) and can be retried. Usage log `writing_assessment_runs` (tokens, estimated cost) is on **/teacher/speaking-recordings/usage** next to Speaking.
* Environment: `OPENAI_WRITING_ASSESS_MODEL` (optional; default `OPENAI_MODEL`, then gpt-4o-mini - a stronger model is worth it), `WRITING_PRICES_JSON` (optional price override), `WRITING_PROCESSING_BUDGET_SECONDS` (optional, default 100). The scheduled jobs `/api/cron/speaking-audio` and `/api/cron/finalize-expired` (both `CRON_SECRET`) also work through due assessments.

## 3. Students' Scores (teacher)

`/teacher/scores`: a teacher's own students (Root: all), search by name/email. Listening, Reading, Writing from the **latest completed Full Mock**, Speaking = the **latest** assessed AI speaking practice, **Overall** = mean of the four with the IELTS rounding (6.25 -> 6.5, 6.75 -> 7.0, 6.125 -> 6.0), only when all four exist - otherwise "-" with "Missing: ...". Writing shows "Processing" while the AI works. `/teacher/scores/[studentId]`: the bands, the Writing report, the practice criteria, the mock date and attempt links, earlier (archived) mocks.

## 4. Full Mock rules

Publishing a Full Mock archives the other active one(s) the publisher manages (after a confirmation that names them and the students in the middle of them, who can still finish). A Full Mock with attempts cannot be deleted from the screen - archive it.

## Schema (migration `20261018000000`, additive)

Enum `WritingAssessmentStatus`; nullable `mock_tests.showResultsToStudent`, `writing_tasks.showResultsToStudent`; new tables `writing_assessments`, `writing_assessment_runs`.
