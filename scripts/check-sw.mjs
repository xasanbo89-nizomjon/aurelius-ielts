// The service worker (src/app/sw.js/route.ts), run in a sandbox with a fake Cache Storage and a fake network - no browser, no database.
//
//   npm run check:sw
//
//   - every build serves different bytes, and names its cache after the build
//   - install precaches the offline page; activate deletes every OLDER aurelius cache (and only those) and claims the tabs
//   - a page load goes to the network; with no network it gets the offline page, or a plain network error - never a rejection
//   - a static file goes to the network first, is cached only when it came back OK, and answers from the cache only when the network fails;
//     a file that fails both ways is a plain network error - never a rejected promise (the old worker's "Uncaught (in promise) TypeError: Failed to fetch")
//   - requests that are not GET, and files outside the static patterns (audio, API, server actions), are left alone
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { GET } from "@/app/sw.js/route";
import { isChunkLoadError } from "@/lib/chunk-reload";

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log("ok   ", name);
  } catch (error) {
    failed++;
    console.log("FAIL ", name, "\n     ", String(error?.stack ?? error).split("\n").slice(0, 5).join("\n      "));
  }
}

const ORIGIN = "https://aurelius.test";

class FakeCache {
  constructor() {
    this.entries = new Map();
  }
  async add(request) {
    const req = typeof request === "string" ? new Request(ORIGIN + request) : request;
    const response = await world.fetch(req);
    if (!response.ok) throw new TypeError("bad response");
    this.entries.set(new URL(req.url).pathname, response);
  }
  async put(request, response) {
    this.entries.set(new URL(typeof request === "string" ? ORIGIN + request : request.url).pathname, response);
  }
  async match(request) {
    const pathname = new URL(typeof request === "string" ? ORIGIN + request : request.url).pathname;
    return this.entries.get(pathname)?.clone();
  }
  async keys() {
    return [...this.entries.keys()];
  }
}

/** A fresh browser: caches, a network that can be switched off or made to answer a given status, and the worker's event listeners. */
function makeWorld(source) {
  const caches = new Map();
  const listeners = {};
  const state = { online: true, status: 200, claimed: false, skipped: false, requested: [] };
  world = {
    state,
    caches,
    listeners,
    fetch: async (request) => {
      const req = typeof request === "string" ? new Request(ORIGIN + request) : request;
      state.requested.push(new URL(req.url).pathname);
      if (!state.online) throw new TypeError("Failed to fetch");
      const response = new Response(`body of ${new URL(req.url).pathname}`, { status: state.status });
      Object.defineProperty(response, "type", { value: "basic" }); // what a same-origin network answer is
      return response;
    },
  };
  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type, listener) => (listeners[type] = listener),
      skipWaiting: () => (state.skipped = true),
      clients: { claim: async () => (state.claimed = true) },
    },
    caches: {
      open: async (name) => {
        if (!caches.has(name)) caches.set(name, new FakeCache());
        return caches.get(name);
      },
      keys: async () => [...caches.keys()],
      delete: async (name) => caches.delete(name),
      match: async (request) => {
        for (const cache of caches.values()) {
          const found = await cache.match(request);
          if (found) return found;
        }
        return undefined;
      },
    },
    fetch: world.fetch,
    Request: class extends Request {
      constructor(input, init) {
        super(typeof input === "string" ? new URL(input, ORIGIN).href : input, init);
      }
    },
    Response,
    URL,
    TypeError,
    Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return world;
}
let world;

/** Dispatches a fetch event the way the browser does; returns { handled, response } where response is what respondWith was given, awaited. */
async function fire(url, { method = "GET", mode = "cors" } = {}) {
  const request = new Request(ORIGIN + url, { method });
  Object.defineProperty(request, "mode", { value: mode });
  let given;
  world.listeners.fetch({ request, respondWith: (promise) => (given = promise) });
  if (given === undefined) return { handled: false };
  return { handled: true, response: await given }; // a rejected promise makes this throw: that is what the check must never see
}

async function lifecycle(type) {
  let work;
  world.listeners[type]({ waitUntil: (promise) => (work = promise) });
  await work;
}

const sourceOf = async () => (await GET().text());

await check("the worker is served without caching and names its build", async () => {
  const response = GET();
  assert.match(response.headers.get("Content-Type"), /javascript/);
  assert.match(response.headers.get("Cache-Control"), /no-store|no-cache/);
  assert.equal(response.headers.get("Service-Worker-Allowed"), "/");
  const text = await response.text();
  assert.match(text, /const BUILD_ID = "[A-Za-z0-9._-]+";/);
  assert.match(text, /CACHE_NAME = CACHE_PREFIX \+ "static-" \+ BUILD_ID/);
});

await check("the id in the bytes is this deployment's (so every deploy serves a different worker and the browser installs it)", async () => {
  let expected = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "";
  if (!expected) {
    try {
      expected = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
    } catch {
      expected = "dev"; // no build yet: the development fallback
    }
  }
  expected = expected.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80) || "dev";
  assert.ok((await sourceOf()).includes('const BUILD_ID = "' + expected + '";'));
});

await check("install precaches the offline page of this build and does not wait for the old tabs", async () => {
  makeWorld(await sourceOf());
  await lifecycle("install");
  const names = [...world.caches.keys()];
  assert.equal(names.length, 1);
  assert.match(names[0], /^aurelius-static-/);
  assert.deepEqual(await world.caches.get(names[0]).keys(), ["/offline"]);
  assert.equal(world.state.skipped, true);
});

await check("install survives a network that is down (the very first visit offline)", async () => {
  makeWorld(await sourceOf());
  world.state.online = false;
  await lifecycle("install");
  assert.equal(world.state.skipped, true);
});

await check("activate deletes every OLDER aurelius cache, keeps this build's and anybody else's, and claims the open tabs", async () => {
  makeWorld(await sourceOf());
  await lifecycle("install");
  const current = [...world.caches.keys()][0];
  world.caches.set("aurelius-static-v2", new FakeCache()); // the old worker's fixed name
  world.caches.set("aurelius-static-PREVIOUSBUILD", new FakeCache());
  world.caches.set("someone-elses-cache", new FakeCache());
  await lifecycle("activate");
  assert.deepEqual([...world.caches.keys()].sort(), [current, "someone-elses-cache"].sort());
  assert.equal(world.state.claimed, true);
});

await check("a page load goes to the network; offline it gets the offline page; with nothing cached, a plain network error (no rejection)", async () => {
  makeWorld(await sourceOf());
  await lifecycle("install");
  const online = await fire("/student/dashboard", { mode: "navigate" });
  assert.equal(await online.response.text(), "body of /student/dashboard");
  world.state.online = false;
  const offline = await fire("/student/dashboard", { mode: "navigate" });
  assert.equal(await offline.response.text(), "body of /offline");
  world.caches.clear();
  const bare = await fire("/student/dashboard", { mode: "navigate" });
  assert.equal(bare.response.type, "error");
});

await check("a static file: network first, cached when it came back OK, answered from the cache only when the network fails", async () => {
  makeWorld(await sourceOf());
  await lifecycle("install");
  const first = await fire("/_next/static/chunks/app/offline/page-abc123.js");
  assert.equal(await first.response.text(), "body of /_next/static/chunks/app/offline/page-abc123.js");
  world.state.requested.length = 0;
  const second = await fire("/_next/static/chunks/app/offline/page-abc123.js");
  assert.ok(world.state.requested.includes("/_next/static/chunks/app/offline/page-abc123.js"), "while the network works it is asked first - never cache-first");
  assert.equal(second.response.status, 200);
  world.state.online = false;
  const offline = await fire("/_next/static/chunks/app/offline/page-abc123.js");
  assert.equal(await offline.response.text(), "body of /_next/static/chunks/app/offline/page-abc123.js", "the copy of this build");
});

await check("a chunk that is gone (an old deployment): the 404 reaches the page untouched and is not cached; offline with no copy it is a network error, never an uncaught rejection", async () => {
  makeWorld(await sourceOf());
  await lifecycle("install");
  world.state.status = 404;
  const gone = await fire("/_next/static/chunks/app/offline/page-OLDHASH.js");
  assert.equal(gone.response.status, 404);
  const cache = [...world.caches.values()][0];
  assert.deepEqual(await cache.keys(), ["/offline"], "a 404 is never stored");
  world.state.status = 200;
  world.state.online = false;
  const neither = await fire("/_next/static/chunks/app/offline/page-NEVER-SEEN.js");
  assert.equal(neither.response.type, "error");
});

await check("a broken cache (full disk, blocked storage) never stops a file reaching the page", async () => {
  makeWorld(await sourceOf());
  await lifecycle("install");
  const sandboxCaches = [...world.caches.values()][0];
  sandboxCaches.put = async () => {
    throw new Error("QuotaExceededError");
  };
  const response = await fire("/_next/static/css/abc.css");
  assert.equal(response.response.status, 200);
});

await check("what is not the worker's business is left alone: POST, audio, API routes, server actions, other sites", async () => {
  makeWorld(await sourceOf());
  await lifecycle("install");
  assert.equal((await fire("/student/exam/x", { method: "POST" })).handled, false);
  assert.equal((await fire("/uploads/audio/part1.mp3")).handled, false);
  assert.equal((await fire("/api/cron/finalize-expired")).handled, false);
  const foreign = new Request("https://cdn.example.com/_next/static/chunks/a.js");
  let given;
  world.listeners.fetch({ request: foreign, respondWith: (p) => (given = p) });
  assert.equal(given, undefined);
});

await check("the page recognises a ChunkLoadError (and nothing else)", () => {
  assert.equal(isChunkLoadError(Object.assign(new Error("Loading chunk 123 failed.\n(error: https://x/_next/static/chunks/123.js)"), { name: "ChunkLoadError" })), true);
  assert.equal(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/_next/static/chunks/a.js")), true);
  assert.equal(isChunkLoadError("Loading CSS chunk 7 failed"), true);
  assert.equal(isChunkLoadError(new Error("Cannot read properties of undefined")), false);
  assert.equal(isChunkLoadError(null), false);
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
