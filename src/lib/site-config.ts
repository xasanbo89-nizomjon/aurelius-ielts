/**
 * Phase 31 — Part 4, SEO. One real source of truth for the site's public
 * identity (name/description/URL), reused by the root layout's metadata,
 * the OG image, sitemap.ts and robots.ts — so they can never drift out of
 * sync with each other. NEXT_PUBLIC_APP_URL is real config, not a secret;
 * falls back to localhost for local dev so nothing breaks before it's set
 * in production.
 */
export const SITE_NAME = "Aurelius IELTS";
export const SITE_DESCRIPTION =
  "A premium IELTS learning platform for students and teachers — Listening, Reading, Writing, Speaking, and full mock tests with real, verified progress tracking, AI feedback, and Premium plans.";

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return configured || "http://localhost:3000";
}
