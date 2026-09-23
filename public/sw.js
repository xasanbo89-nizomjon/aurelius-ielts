// Aurelius IELTS — deliberately minimal service worker.
//
// Scope, on purpose: ONLY static, hashed/public assets (_next/static JS+CSS,
// images, fonts, icons). It never touches navigation requests (HTML pages),
// API routes, or Server Actions (always POST, and this worker only ever
// intercepts GET) — every dashboard/exam/auth page is always fetched fresh
// from the network, exactly as if this worker didn't exist. That's what
// makes it safe to add: it can only ever make static assets load faster on
// repeat visits, never serve stale or wrong per-user data.
const CACHE_NAME = "aurelius-static-v1";
const STATIC_CACHE_PATTERNS = [/^\/_next\/static\//, /^\/icons\//, /^\/manifest\.json$/];

function isCacheableStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return STATIC_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

self.addEventListener("install", () => {
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
