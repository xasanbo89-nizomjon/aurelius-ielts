# Service worker (offline page) and chunk errors

`/sw.js` is **generated** by `src/app/sw.js/route.ts`, not a file in `public/`. It exists for one job: show `/offline` when a page cannot be loaded because
there is no connection. It is registered by `src/components/pwa-register.tsx`.

## What went wrong before

The old worker was a static file with one fixed cache name. It precached `/offline` and cached `/_next/static/...` files cache-first, so after the next deployment
it still answered with the *previous* deployment's page and chunk names. Those files no longer existed, the browser asked the network for them through the worker,
and the console showed `FetchEvent for /_next/static/chunks/app/offline/page-<hash>.js resulted in a network error` and
`Uncaught (in promise) TypeError: Failed to fetch`.

## What it does now

| Rule | Why |
| --- | --- |
| The bytes of `/sw.js` change with every deployment (the build id is written into it: `VERCEL_DEPLOYMENT_ID`, else `VERCEL_GIT_COMMIT_SHA`, else `.next/BUILD_ID`) and the file is served `no-store` | the browser installs the new worker at the first visit after a deploy |
| The cache is named `aurelius-static-<build id>`; **activate deletes every other `aurelius-*` cache** | nothing of an older deployment can ever be answered |
| `skipWaiting()` on install, `clients.claim()` on activate | a new deployment takes over at once, in the tabs that are already open |
| **Network first** for page loads and for `/_next/static`, `/icons`, `manifest.json`; a cached copy (this build's) answers only if the network fails; a page load that fails shows `/offline` | no hashed chunk is ever taken from a list fixed at install time; a real, per-user page is never served from a cache |
| Only an OK same-origin answer is stored; a 404 for a chunk of an old deployment is passed on untouched | a gone chunk is not "repaired" with something else |
| Every path ends in a response (`Response.error()` at worst) and every cache call is in `try/catch` | no `Uncaught (in promise)`; a full or blocked cache never stops a page |
| Not touched: non-GET requests, other origins, audio, `/api`, server actions | the exam, its autosave and the recordings never go through a cache |

## ChunkLoadError in the page

If a chunk of an older deployment cannot be loaded (an open tab, a deploy in between), the page **reloads once**: `src/lib/chunk-reload.ts` (`reloadOnceForChunkError`,
a one-minute cool-down in `sessionStorage` so it can never loop). It is called by the error boundaries (`app/error.tsx`, `global-error.tsx`, the student and teacher
`error.tsx`) and by `pwa-register.tsx` for `unhandledrejection`, `error` and a failing `<script>` under `/_next/static/`. An ordinary error does not reload anything.

## Checking it

* `npm run check:sw` - the worker in a sandbox with a fake network and cache (11 checks).
* In a browser (done on 2026-10-07 in real Chrome): install a build, deploy a second and a third time without clearing anything, open the site each time with the
  previous worker still installed - the new worker replaces it, the old cache is gone, `/offline` works with the network off, the console shows no errors, a click in a
  stale tab works; a dynamic import of a missing chunk reloads once and not twice within a minute.
