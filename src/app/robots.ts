import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-config";

/** Phase 31 — Part 4, SEO. Disallows every real auth-gated area — nothing behind the login wall is indexable anyway, so this is honest policy, not decoration. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/student/", "/teacher/", "/onboarding", "/offline/", "/api/"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
