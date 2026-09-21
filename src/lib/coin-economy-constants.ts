/**
 * Pure constants shared between server logic (src/lib/coins.ts) and client
 * components (e.g. the Redeem Premium button) — no "server-only" here on
 * purpose, same reasoning as src/lib/uploads/image-constraints.ts.
 */
export const COINS_PER_HOUR_STUDIED = 15;
export const MAX_DAILY_STUDY_COINS = 45;
export const PREMIUM_REDEMPTION_COST = 1000;
export const PREMIUM_REDEMPTION_DAYS = 30;
