// Aurelius IELTS — deliberately minimal service worker.
//
// Scope, on purpose: ONLY static, hashed/public assets (_next/static JS+CSS,
// images, fonts, icons) plus one real offline fallback. It never touches
// API routes or Server Actions (always POST, and this worker only ever
// intercepts GET), and every dashboard/exam/auth page is still always
// fetched fresh from the network — a failed navigation falls back to the
// static /offline page, it never serves a cached (and possibly stale or
// wrong per-user) copy of the real page. That's what keeps this safe to
// extend: static assets load faster on repeat visits, and losing
// connection mid-navigation shows a real page instead of the browser's
// default error screen — neither path can ever serve stale per-user data.
//
// Phase 28 — Offline Articles/Downloads (src/lib/offline/db.ts, the
// /offline/* routes) don't rely on this worker at all: they're plain
// client components reading IndexedDB, made reachable offline simply by
// being static routes whose JS chunks get cache-first'd below after a
// student's first visit.
const CACHE_NAME = "aurelius-static-v2";
const OFFLINE_URL = "/offline";
const STATIC_CACHE_PATTERNS = [/^\/_next\/static\//, /^\/icons\//, /^\/manifest\.json$/];

function isCacheableStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return STATIC_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => {
        // A failed precache (e.g. offline during the very first install)
        // shouldn't block the worker from installing at all.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Navigations (real page loads) always go to the network — only a
  // failure (no connection) falls back to the precached static offline
  // page. Never serves a cached copy of a real, per-user page.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  const url = new URL(event.request.url);
  if (!isCacheableStaticAsset(url)) return;

  // Cache-first: hashed Next.js asset URLs change on every real deploy, so
  // a cached response is never stale in a way that matters.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
  );
});
