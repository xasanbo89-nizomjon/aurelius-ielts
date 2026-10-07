# Speaking practice with an AI assessment (Phase Q-B)

A student answers an IELTS Speaking question **out loud**, the recording goes to private storage, and an AI that listens to it marks the four IELTS criteria and
writes feedback. It is **practice only**: it is not part of a Full Mock, there is no live examiner, and every result is labelled
**"AI estimate - not an official IELTS score"**. Every number the screens show is a stored band or a count/sum of stored rows - nothing is invented.

Where it lives:

| Who | Where |
| --- | --- |
| Student | `Speaking Practice` -> **Record an answer** (`/student/speaking-practice/record`), a result page per practice (`/student/speaking-practice/record/<id>`), **My recordings** with progress (`/student/speaking-practice/recordings`) |
| Teacher | **Speaking Recordings** (`/teacher/speaking-recordings`): the recordings of *their own students*, listen, read the assessment, comment |
| Root Teacher | the same for **every** student, plus **Usage and cost** and the daily limit (`/teacher/speaking-recordings/usage`) |

## The student's screen

1. **Question** - Part 1, 2 or 3; a question from the Speaking Topics the teachers published (Part 2: a cue card) or one the student types (Part 2: the topic line
   and the "You should say" points). The feedback language is English (default) or O'zbekcha: the explanations are written in it, the corrections, better words and
   the model answer always stay in English.
2. **Microphone check** - turn the microphone on, watch the level meter, record three seconds and listen back. A refused microphone is explained with the steps
   **for the student's own browser** (iPhone/iPad Safari: *Settings > Safari > Microphone*; Safari on a Mac; Chrome/Edge/Firefox: the lock icon; Android), and the same for
   "no microphone", "in use by another app", a browser without microphone support and a page that is not on https. *Try again* works once the cause is gone.
3. **Record**
   * Part 1 / 3: *Start recording*, the screen suggests a length (Part 1 about 20-40 s, Part 3 about 30-60 s), *Stop*. At most **2 minutes**: the recorder stops by itself.
   * Part 2: *Start preparation* - **one minute** with a countdown and a notes box; when it ends the recording **starts by itself** (or press *Start speaking now*) and
     **stops by itself at 2:00**. The notes stay on the screen while speaking and are stored with the practice.
   * The length of a recording is the **number of samples captured**, not a timer, so a throttled page can never record more or less than it shows. A microphone lost
     during the recording keeps what was said; a browser that delivers no sound at all is detected after 3 seconds and explained. The screen is kept awake while preparing and speaking (a phone that locks its screen stops recording).
   * Then listen back, *Record again* as often as wanted, *Send for AI assessment*. A silent recording or one under 5 seconds cannot be sent.
4. **Send** - three visible steps: the server starts the practice (checks the daily limit, gives out a one-time upload link), the browser uploads **straight to storage** with a
   progress bar (3 tries, gives up on a dead connection after 45 s), the server confirms it has the file. The recording stays on the page until it is sent: *Try again* repeats
   only what is missing (it asks for a fresh link first), *Download my recording* keeps a copy, and nothing is recorded twice. A lost confirmation is repeated by itself.
   The finished recording is also **kept in the browser's own storage** (IndexedDB: one per student per browser, 24 hours, removed when it has been sent or thrown away): a closed tab or a phone that
   discarded the page does not lose it - the next visit says "You have a recording that was never sent" with *Listen to it and send it* / *Throw it away*.
5. **Result** - the student may leave at any time (the work runs on the server); the page asks how far it is every 2-8 s and reloads itself when it is done.

### The recording format

The browser captures raw samples (a `ScriptProcessor` on the microphone stream, created inside the click that asks for the microphone, which Safari/iOS require) and writes a
**16 kHz mono 16-bit WAV** (`src/lib/speaking-audio/wav.ts`, downsampling with a box filter so the hiss of an "s" does not fold into the speech band). Why not MediaRecorder: it
gives WebM in Chrome and MP4 in Safari, the audio model accepts WAV/MP3 only, and a serverless server has no converter. 2 minutes = 3.8 MB (32 KB a second); the hard limit is 6 MB.

## Storage and who may hear a recording

* One **private** Supabase bucket, `speaking-practice-recordings` (`SPEAKING_PRACTICE_BUCKET`), created by `ensurePrivateBucket` on first use; a bucket that exists but is public is
  **refused**. Objects are `<studentId>/<practiceId>.wav`. There is no public address (checked: the public URL answers 400).
* The browser gets only a **one-time signed upload link** for one path. To hear a recording a page asks the server for a **signed link that lasts 10 minutes**
  (`getRecordingUrl`), after the server has checked who is asking; the player asks for a fresh one if the page was left open longer.
* Scopes (`src/lib/speaking-audio/practice.ts`, the same rule as everywhere else: `studentScope`): a **student** sees only their own practices, a **teacher** the practices of the students
  assigned to them, a **Root Teacher** everybody's. "Not yours" answers 404 exactly like "does not exist" (pages, the status route, the signed link).

## The AI

All calls are made on the server (`src/lib/ai/services/speaking-audio-assessment.ts`); the API key never reaches a browser (the production bundles were scanned: no key, no secret,
no server-only module name in any file served to browsers).

1. **Transcription** - `OPENAI_SPEAKING_TRANSCRIBE_MODEL` (default `gpt-4o-mini-transcribe`, English, temperature 0).
2. **Assessment by a model that listens** - `OPENAI_SPEAKING_ASSESS_MODEL` (default `gpt-audio-mini`) receives the **audio itself** plus the transcript, the question, the cue card
   and the student's notes, so Fluency & Coherence and Pronunciation are judged from the sound. The examiner prompt contains the **public IELTS band descriptors**, the rules (quotes are copied
   exactly from the transcript; a pronunciation problem is quoted as the word and corrected by how to say it) and the JSON the reply must be. Temperature 0.2.
3. The audio chat models take no response schema, so the JSON is described **in the prompt**, checked with **zod**, and **one retry** says what was wrong with the first reply
   ("Your previous reply could not be used: ..."). Two bad replies end as *BAD_FORMAT* (the student can press *Try again*). The same one retry covers the **feedback language**: a model asked for Uzbek feedback about an
   English answer sometimes answers in English (about 1 time in 6 in the trials), so the prompt repeats the language at the end of the question and the reply is checked (`language.ts`: a text with a fifth or more very common
   English words is English); an English reply to an Uzbek request is sent back once, and the second reply is used whatever its language - the student always gets their bands and feedback.
4. If the configured assessment model cannot take audio (unknown model, no access) the assessment is made **from the transcript** by `OPENAI_SPEAKING_FALLBACK_MODEL` (default `OPENAI_MODEL`) and
   Pronunciation is shown as **"estimated from the transcript"**.
5. **Bands**: each criterion (Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation) in half bands; the **overall is worked out by the app** as the mean of the four,
   rounded the IELTS way (.25 up to .5, .75 up to the next band) - a number the model sends as "overall" is ignored. Also stored: a short summary, strengths, **mistakes quoting the student's
   own words with the correction**, better vocabulary with an example, and a **model answer about one band higher** (Part 1 ~40-70 words, Part 2 ~150-220, Part 3 ~80-130).
6. Time budget: one assessment may take at most `SPEAKING_PROCESSING_BUDGET_SECONDS` (default 100 s; no call starts or waits past it, so a serverless function is never cut off half way) and
   the pages that start it set `maxDuration = 120`.

**Calibration** (text-to-speech samples of three levels of English, real pipeline, run twice each): low (grammar errors, simple words) 5.5, mid 6.5, high 7.0 - in the right order, and two runs of the
same recording gave the **same** bands. The prompt errs on the strict side for a short answer ("do not give a high band for range that was not shown"); a real examiner would put the high sample
a little higher. Text-to-speech has no accent, so Pronunciation is never the limiting criterion in these samples.

## The life of a practice

```
AWAITING_UPLOAD --recording arrives--> PENDING --worker claims--> PROCESSING --> DONE
                                                                       |
                                                                       +--> FAILED --Try again (same recording)--> PENDING
```

* **AWAITING_UPLOAD** - the practice exists and the upload link was given out. It holds a place in today's count for 60 minutes (so many unfinished starts cannot get round the limit); a start older
  than a day is deleted with whatever it left in storage (when the student starts a new one, and by the scheduled job).
* **Finalising** - the server looks for the file itself (the browser's word is not taken), checks its size, counts the practice (`submittedAt`) and hands it to a worker with `after()`.
* **PROCESSING** holds a **lease** of 5 minutes. The claim is one conditional update, so two workers never run the same practice, and the final write is conditional on the claim still being the worker's:
  a replaced worker can never overwrite a newer one. A worker that died is replaced when its lease runs out - twice at most, then the practice is shown as *interrupted* and the student can press *Try again*.
* **Three things start stuck work**: `after()` right after the recording arrives; **looking at it** (the result page and `GET /api/speaking-audio/<id>/status` start a practice that has waited more than 30 s
  or whose lease ran out); and the optional **scheduled job** `GET /api/cron/speaking-audio` with `Authorization: Bearer <CRON_SECRET>` (like Phase K's, see `docs/server-expiry.md`; it also drops abandoned starts).
* **Failures** and what the student reads (`src/lib/speaking-audio/status.ts`): *no speech heard* (record again), *the AI service did not answer* / *unexpected format* / *interrupted* / *internal* (**Try again**),
  *the recording did not reach the server* / *could not be read* (record again). **Try again assesses the same recording and the same practice: nothing is recorded or uploaded again, and it does not use the daily
  limit a second time.** Every failed AI call is in the usage log.

## Limits

* **Daily limit** - how many recorded practices a student may make a day, **set by the Root Teacher** on the usage page (1-100, stored in `platform_settings`, key `speaking.dailyPracticeLimit`, default 5). "Day" is the calendar day in
  **Tashkent time** (UTC+5), whatever zone the server runs in. The count is taken under a database lock, so two tabs cannot both take the last place. It is checked when the practice starts **and** again when the recording arrives.
* **Length** - 5 seconds to 2 minutes; **size** - at most 6 MB (a real 2-minute recording is 3.8 MB); the question text 1500 characters, the preparation notes 2000.
* Reading one's own feedback and history needs no Premium plan; recording a new answer does (the same `hasActiveAccess` rule as the other Speaking features).

## Usage and cost (Root Teacher)

Every AI call - transcription, assessment, the second try after an unusable reply, the transcript-only fallback, **and the failed ones** - is a row in `speaking_audio_runs` with the model, prompt / completion /
audio tokens, audio seconds, an **estimated cost** (millionths of a dollar) and how long it took. `/teacher/speaking-recordings/usage` shows, for any month (Tashkent time): the cost estimate, the practices submitted /
assessed / failed / waiting, the AI calls and failures, the audio minutes transcribed, tokens by model, a day-by-day table, the students who used it most, and the **measured cost of one assessment** (the average of the
last 50 assessed practices, all their calls added up). The estimate is the reported usage times the list prices kept in `src/lib/speaking-audio/cost.ts`; `SPEAKING_PRICES_JSON` overrides them when a price changes.
Measured with the defaults: **about $0.004-0.006 for a 15-25 second Part 1 / 3 answer** (about $0.0007 transcription + $0.003-0.005 assessment) and **$0.022 for a two-minute Part 2** ($0.006 transcription +
$0.016 assessment: 4,555 prompt tokens of which 1,200 are the audio itself - about 10 audio tokens a second - and 924 tokens written). A full day of the default limit (5 practices) is therefore a few cents per student.

## Hand-over to Phase O

`getLatestSpeakingBand(studentId)` (`src/lib/speaking-audio/practice.ts`) returns `{ band, at, practiceId }` of the student's most recently assessed practice (`overallBand` is stored on every practice), or null.

## Environment

| Name | Meaning |
| --- | --- |
| `OPENAI_API_KEY` | existing; server only |
| `OPENAI_SPEAKING_TRANSCRIBE_MODEL` | speech-to-text model (default `gpt-4o-mini-transcribe`) |
| `OPENAI_SPEAKING_ASSESS_MODEL` | the model that listens and marks (default `gpt-audio-mini`) |
| `OPENAI_SPEAKING_FALLBACK_MODEL` | marks from the transcript when the model above cannot take audio (default `OPENAI_MODEL`) |
| `SPEAKING_PRICES_JSON` | optional price overrides for the cost estimate |
| `SPEAKING_PROCESSING_BUDGET_SECONDS` | the time one assessment may take (default 100) |
| `CRON_SECRET` | existing (Phase K); also protects the new scheduled job |

## Checks

`npm run check:speaking` (15 rules, no database, no network): the band arithmetic and rounding, reading the model's reply (fenced JSON, wrong shape, out of range), the examiner prompt, the cost estimate, the WAV format and
the downsampling, the daily limit and the Tashkent day, the microphone error messages for each browser, the life of a practice, the progress numbers, the input checks. In the browser (real Chrome with a fake microphone
that plays speech, real storage, real AI) and on the server (real database and storage, a fake AI client so failures can be made to happen) the whole flow was run - see the Phase Q-B section of `docs/roadmap.md`.
