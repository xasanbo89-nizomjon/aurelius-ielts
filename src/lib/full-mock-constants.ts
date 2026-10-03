// Phase 34 — plain constants shared by both server-only lib code and client
// components (the builder wizard's dialogs). Deliberately has no
// "server-only" import and no DB access, unlike full-mock-tests.ts.

/** Official IELTS Listening time as sat in a Full Mock: 40 minutes (recording + question time). */
export const FULL_MOCK_LISTENING_MINUTES = 40;
/** Official IELTS computer-delivered transfer time: 2 minutes to check answers once the recording has finished. */
export const FULL_MOCK_LISTENING_TRANSFER_MINUTES = 2;
/** Official IELTS Reading time: 60 minutes, no extra transfer time. */
export const FULL_MOCK_READING_MINUTES = 60;
/** Official IELTS Writing time: 60 minutes for BOTH tasks together (the suggested split is Task 1: 20 min, Task 2: 40 min) — one countdown, the student divides it. */
export const FULL_MOCK_WRITING_MINUTES = 60;
/** Phase 47 — real IELTS Speaking runs 11-14 minutes across all 3 parts; the mock allots a clean 15-minute session budget (never below the real upper bound), used by the Full Mock speaking leg's visible countdown. */
export const FULL_MOCK_SPEAKING_MINUTES = 15;
/** Official IELTS minimum word counts. */
export const TASK_1_MIN_WORDS = 150;
export const TASK_2_MIN_WORDS = 250;
