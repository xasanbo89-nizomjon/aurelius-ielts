/**
 * Pure constants shared between server logic (src/lib/coins.ts) and client
 * components (e.g. the Redeem Premium button) — no "server-only" here on
 * purpose, same reasoning as src/lib/uploads/image-constraints.ts.
 */
export const COINS_PER_HOUR_STUDIED = 15;
export const MAX_DAILY_STUDY_COINS = 45;
export const PREMIUM_REDEMPTION_COST = 1000;
export const PREMIUM_REDEMPTION_DAYS = 30;

/**
 * Phase 17 — Article Audio. One-time rewards, each gated by a real
 * completion threshold and an idempotency key so re-crossing it never pays
 * out twice — a real, enforced maximum per article, not just a documented
 * intent. ARTICLE_READ_COMPLETE_COINS updated in Phase 39 (was 5) to match
 * that phase's explicit reward table — same idempotency key, so no student
 * is ever paid twice for an article they'd already completed under the old amount.
 */
export const ARTICLE_READ_COMPLETE_COINS = 10;
export const ARTICLE_AUDIO_COMPLETE_COINS = 5;
export const ARTICLE_AUDIO_COMPLETE_THRESHOLD_PERCENT = 90;

/**
 * Phase 39 — Part 4/5. Flat, one-time-per-real-event rewards layered on top
 * of the time-based study coins above — same "real completion + idempotency
 * key" pattern as the article rewards, just for more event types. Each is
 * awarded from a results/completion PAGE (never from inside the Reading/
 * Listening/Writing/Speaking/Mock-Test engines themselves, per Phase 39's
 * explicit "don't touch exam engine logic" rule) using awardCoins()'s own
 * idempotency guarantee, so a page revisit can never double-pay.
 */
export const LOGIN_DAILY_COINS = 5;
export const PRACTICE_SESSION_COINS = 15;
export const MOCK_TEST_COMPLETE_COINS = 25;

/** Phase 39 — Part 5. Real streak milestones, checked once per exact day-count transition (never re-paid on a later visit). Supersedes the original Phase 26 amounts (100/500/1000 at 7/30/90 days) with Phase 39's explicit numbers. */
export const STREAK_MILESTONE_REWARDS: { days: number; coins: number }[] = [
  { days: 7, coins: 50 },
  { days: 30, coins: 250 },
  { days: 100, coins: 1000 },
];
