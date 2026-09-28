import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-config";

/**
 * Phase 31 — Part 4, SEO. Only the real public, unauthenticated routes —
 * every /student/*, /teacher/*, /onboarding page requires a real login and
 * has nothing for a crawler to index, so it's deliberately excluded here
 * (and disallowed in robots.ts) rather than listed with fake priority.
 * There is currently no public Articles listing or a dedicated Pricing/
 * About page (Premium pricing lives at /student/premium, behind auth) —
 * see the Phase 31 report for that gap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/register`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
