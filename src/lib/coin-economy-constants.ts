/**
 * Pure constants shared between server logic (src/lib/coins.ts) and client
 * components (e.g. the Redeem Premium button) — no "server-only" here on
 * purpose, same reasoning as src/lib/uploads/image-constraints.ts.
 */
export const COINS_PER_HOUR_STUDIED = 15;
export const MAX_DAILY_STUDY_COINS = 45;
export const PREMIUM_REDEMPTION_COST = 1000;
export const PREMIUM_REDEMPTION_DAYS = 30;

/** Phase 17 — Article Audio. One-time rewards, each gated by a real completion threshold and an idempotency key so re-crossing it never pays out twice. */
export const ARTICLE_READ_COMPLETE_COINS = 10;
export const ARTICLE_AUDIO_COMPLETE_COINS = 5;
export const ARTICLE_AUDIO_COMPLETE_THRESHOLD_PERCENT = 90;
