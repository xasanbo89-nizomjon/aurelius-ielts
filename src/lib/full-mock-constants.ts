// Phase 34 — plain constants shared by both server-only lib code and client
// components (the builder wizard's dialogs). Deliberately has no
// "server-only" import and no DB access, unlike full-mock-tests.ts.

/** Official IELTS Writing timing (Task 1: 20 min + Task 2: 40 min) — a fixed exam-format constant, not a guess. */
export const FULL_MOCK_WRITING_MINUTES = 60;
/** Official IELTS Speaking timing upper bound (11–14 minutes total across all 3 parts). */
export const FULL_MOCK_SPEAKING_MINUTES = 14;
/** Official IELTS minimum word counts. */
export const TASK_1_MIN_WORDS = 150;
export const TASK_2_MIN_WORDS = 250;
