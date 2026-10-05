// Phase J - regression guard for the Writing exam screen's safety logic. No database, no browser: the pure rules and the draft engine,
// driven against a fake server.
//
//   npm run check:writing
//
//   word counter        one rule for the screen and the server (whitespace, hyphenated = one word, numbers and symbols count)
//   instruction line    the "spend about 20 minutes / write at least 150 words" sentences move from the stored task text to the part bar
//   browser copy        which copy wins when the screen opens again (unsaved local text vs. the server's), and unreadable storage
//   draft engine        autosave coalescing and max-wait, retry while offline, a lost answer is not a conflict, a request that never answers,
//                       an older window is refused and stops, restore after a crash, flush, time up, handed in elsewhere, storage that throws
//
// Exit code 1 if any check fails.
import assert from "node:assert/strict";

import { countWords } from "@/lib/writing/word-count";
import { splitWritingInstructions } from "@/lib/writing/instructions";
import { backupKey, decideRestore, parseBackup, serializeBackup } from "@/lib/writing/draft-backup";
import { createWritingDraftEngine } from "@/lib/writing/draft-engine";

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log("ok   ", name);
  } catch (error) {
    failed++;
    console.log("FAIL ", name, "\n     ", String(error?.message ?? error).split("\n").join("\n      "));
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (condition, ms = 3000) => {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > ms) throw new Error("timed out waiting for a condition");
    await sleep(5);
  }
};

// ------------------------------------------------------------------ the word counter
await test("word counter: empty and whitespace-only text is 0", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   \n\t  \n"), 0);
});
await test("word counter: any whitespace separates, empty pieces are ignored", () => {
  assert.equal(countWords("one two  three\nfour\t five\r\n\r\nsix"), 6);
  assert.equal(countWords("  leading and trailing  "), 3);
});
await test("word counter: a hyphenated word is one word", () => assert.equal(countWords("a well-known state-of-the-art idea"), 4));
await test("word counter: numbers and lone symbols count as words", () => {
  assert.equal(countWords("In 2015 the figure rose to 45 % & fell"), 10);
  assert.equal(countWords("1,000,000"), 1);
});
await test("word counter: non-breaking spaces separate words; attached punctuation adds none", () => {
  assert.equal(countWords("one two three"), 3);
  assert.equal(countWords("Hello, world! (It works.)"), 4);
});

// ------------------------------------------------------------------ the instruction line
await test("instructions: both sentences move from the task text to the part bar", () => {
  const r = splitWritingInstructions("You should spend about 20 minutes on this task.\nThe chart below shows visitors.\nSummarise the information.\nWrite at least 150 words.", "TASK_1");
  assert.equal(r.line, "You should spend about 20 minutes on this task. Write at least 150 words.");
  assert.equal(r.body, "The chart below shows visitors.\nSummarise the information.");
});
await test("instructions: the task's own numbers win; defaults when it has none", () => {
  assert.equal(splitWritingInstructions("You should spend about 25 minutes on this task.\nDescribe the map.\nWrite at least 170 words.", "TASK_1").line, "You should spend about 25 minutes on this task. Write at least 170 words.");
  assert.equal(splitWritingInstructions("The graph shows trends.", "TASK_1").line, "You should spend about 20 minutes on this task. Write at least 150 words.");
  assert.equal(splitWritingInstructions("Some people think X. Discuss.", "TASK_2").line, "You should spend about 40 minutes on this task. Write at least 250 words.");
});
await test("instructions: only the first and last lines are taken; a prompt that is only the sentences stays whole", () => {
  const middle = "Discuss. Write at least 5 words here, you should spend about 3 minutes.\nMore.";
  assert.equal(splitWritingInstructions(middle, "TASK_2").body, middle);
  const only = "You should spend about 40 minutes on this task.\nWrite at least 250 words.";
  assert.equal(splitWritingInstructions(only, "TASK_2").body, only);
});

// ------------------------------------------------------------------ the browser's copy
const entry = (over) => ({ text: "local", base: "2026-10-05T10:00:00.000Z", dirty: true, at: Date.parse("2026-10-05T10:05:00.000Z"), ...over });
const server = (content, updatedAt) => ({ content, updatedAt });
await test("browser copy: nothing unsaved, or the same words, means the server's copy", () => {
  assert.equal(decideRestore(undefined, server("s", "2026-10-05T10:00:00.000Z")), "server");
  assert.equal(decideRestore(entry({ dirty: false }), server("s", "2026-10-05T10:00:00.000Z")), "server");
  assert.equal(decideRestore(entry({ text: "s" }), server("s", "2026-10-05T10:00:00.000Z")), "server");
});
await test("browser copy: unsaved text typed on the version the server still has is newer", () => {
  assert.equal(decideRestore(entry({}), server("s", "2026-10-05T10:00:00.000Z")), "local");
  assert.equal(decideRestore(entry({ base: null }), server("", null)), "local");
});
await test("browser copy: when the server has moved on the later one wins - an older copy never overwrites", () => {
  assert.equal(decideRestore(entry({ base: "2026-10-05T09:00:00.000Z", at: Date.parse("2026-10-05T10:01:00.000Z") }), server("s", "2026-10-05T10:03:00.000Z")), "server");
  assert.equal(decideRestore(entry({ base: "2026-10-05T09:00:00.000Z", at: Date.parse("2026-10-05T10:09:00.000Z") }), server("s", "2026-10-05T10:03:00.000Z")), "local");
});
await test("browser copy: round trip, and unreadable storage is 'no backup', never an error", () => {
  const b = { v: 1, tasks: { t1: entry({}), t2: entry({ text: "two\nlines ", dirty: false, base: null }) } };
  assert.deepEqual(parseBackup(serializeBackup(b)), b);
  for (const raw of [null, "", "{", "[]", '{"v":2,"tasks":{}}', '{"v":1,"tasks":5}', '{"v":1,"tasks":{"a":{"text":5}}}']) assert.deepEqual(parseBackup(raw), { v: 1, tasks: {} });
  assert.equal(backupKey("fm:abc"), "aurelius-writing:v1:fm:abc");
});

// ------------------------------------------------------------------ the draft engine against a fake server
function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function fakeServer() {
  const rows = new Map();
  let tick = 1;
  const s = {
    offline: false,
    timeUp: false,
    submitted: false,
    saves: [],
    rows,
    stamp: () => new Date(Date.parse("2026-10-05T10:00:00.000Z") + tick++ * 1000).toISOString(),
    seed(taskId, content) {
      const row = { id: `sub-${taskId}`, content, updatedAt: s.stamp() };
      rows.set(taskId, row);
      return row;
    },
    async save(req) {
      s.saves.push(req);
      if (s.offline) throw new Error("offline");
      await sleep(5);
      if (s.timeUp) return { success: false, error: "Time is up.", timeUp: true };
      if (s.submitted) return { success: false, error: "submitted", submitted: true };
      const row = rows.get(req.taskId);
      if (req.baseUpdatedAt && req.baseUpdatedAt !== row.updatedAt) return { success: false, error: "behind", conflict: { content: row.content, updatedAt: row.updatedAt } };
      row.content = req.content;
      row.updatedAt = s.stamp();
      return { success: true, submissionId: row.id, updatedAt: row.updatedAt };
    },
  };
  return s;
}

function make({ server, storage, parts, requestTimeoutMs, save }) {
  const views = [];
  const engine = createWritingDraftEngine({
    attemptKey: "t:1",
    parts: parts.map((p) => {
      const row = server.rows.get(p.taskId);
      return { taskId: p.taskId, submissionId: row?.id ?? null, content: row?.content ?? p.content, updatedAt: row?.updatedAt ?? null };
    }),
    save: (r) => (save ?? server.save)(r),
    requestTimeoutMs,
    storage: storage === undefined ? memoryStorage() : storage,
    onChange: (v) => views.push(v),
    debounceMs: 30,
    maxWaitMs: 120,
    retryMs: [20, 40],
  });
  return { engine, last: () => views[views.length - 1] ?? engine.view() };
}

await test("engine: typing coalesces into one save of the latest text; the browser copy is written at once", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  const storage = memoryStorage();
  const { engine, last } = make({ server, storage, parts: [{ taskId: "t1", content: "" }] });
  for (const text of ["H", "He", "Hel", "Hell", "Hello"]) engine.setText("t1", text);
  const backup = parseBackup(storage.getItem(backupKey("t:1")));
  assert.equal(backup.tasks.t1.text, "Hello");
  assert.equal(backup.tasks.t1.dirty, true);
  assert.equal(last().saveState, "saving");
  await waitFor(() => last().saveState === "saved");
  assert.equal(server.saves.length, 1);
  assert.equal(server.rows.get("t1").content, "Hello");
  assert.equal(parseBackup(storage.getItem(backupKey("t:1"))).tasks.t1.dirty, false);
});
await test("engine: continuous typing is still saved at least every max-wait", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  const { engine, last } = make({ server, parts: [{ taskId: "t1", content: "" }] });
  let text = "";
  for (let i = 0; i < 20; i++) {
    text += "w ";
    engine.setText("t1", text);
    await sleep(20);
  }
  assert.ok(server.saves.length >= 2, `expected several saves while typing, got ${server.saves.length}`);
  await waitFor(() => last().saveState === "saved");
  assert.equal(server.rows.get("t1").content, text);
});
await test("engine: offline - the text stays, the status says so, it is saved when the connection returns", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  const { engine, last } = make({ server, parts: [{ taskId: "t1", content: "" }] });
  server.offline = true;
  engine.setText("t1", "typed while offline");
  await waitFor(() => last().saveState === "offline");
  engine.setText("t1", "typed while offline, and more");
  assert.equal(engine.getText("t1"), "typed while offline, and more");
  assert.equal(engine.hasUnsaved(), true);
  server.offline = false;
  await waitFor(() => last().saveState === "saved");
  assert.equal(server.rows.get("t1").content, "typed while offline, and more");
  assert.equal(last().behind, null);
});
await test("engine: a save whose answer was lost on the way is not mistaken for a change made in another window", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  let calls = 0;
  const { engine, last } = make({
    server,
    parts: [{ taskId: "t1", content: "" }],
    save: async (r) => {
      const result = await server.save(r); // it lands...
      if (++calls === 1) throw new Error("answer lost"); // ...but the answer never arrives
      return result;
    },
  });
  engine.setText("t1", "first words");
  await waitFor(() => server.rows.get("t1").content === "first words");
  engine.setText("t1", "first words and then more");
  await waitFor(() => last().saveState === "saved");
  assert.equal(last().behind, null);
  assert.equal(server.rows.get("t1").content, "first words and then more");
});
await test("engine: a request that is never answered counts as failed after the timeout; the text is sent again", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  let calls = 0;
  const { engine, last } = make({ server, parts: [{ taskId: "t1", content: "" }], requestTimeoutMs: 80, save: (r) => (++calls === 1 ? new Promise(() => undefined) : server.save(r)) });
  engine.setText("t1", "words in a black hole");
  await waitFor(() => last().saveState === "offline", 2000);
  await waitFor(() => last().saveState === "saved", 3000);
  assert.equal(server.rows.get("t1").content, "words in a black hole");
  assert.equal(last().behind, null);
});
await test("engine: a black-holed request that DID land is recognised as this window's own", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  let calls = 0;
  const { engine, last } = make({
    server,
    parts: [{ taskId: "t1", content: "" }],
    requestTimeoutMs: 80,
    save: async (r) => {
      if (++calls === 1) {
        await server.save(r);
        return new Promise(() => undefined);
      }
      return server.save(r);
    },
  });
  engine.setText("t1", "landed but unanswered");
  await waitFor(() => server.rows.get("t1").content === "landed but unanswered", 2000);
  engine.setText("t1", "landed but unanswered, then more");
  await waitFor(() => last().saveState === "saved", 4000);
  assert.equal(last().behind, null);
  assert.equal(server.rows.get("t1").content, "landed but unanswered, then more");
});
await test("engine: an older window is refused and stops - it never overwrites the newer text", async () => {
  const server = fakeServer();
  const row = server.seed("t1", "from tab B");
  const { engine, last } = make({ server, parts: [{ taskId: "t1", content: "from tab B" }] });
  row.content = "from tab B, edited later"; // another window saved newer text
  row.updatedAt = server.stamp();
  engine.setText("t1", "from tab A, stale");
  await waitFor(() => last().behind !== null);
  assert.equal(last().behind.via, "server");
  assert.equal(server.rows.get("t1").content, "from tab B, edited later");
  assert.deepEqual(last().unsavedWhenBehind, [{ taskId: "t1", text: "from tab A, stale" }]);
  const before = server.saves.length;
  engine.setText("t1", "typing after being refused");
  await sleep(120);
  assert.equal(server.saves.length, before);
  assert.equal(server.rows.get("t1").content, "from tab B, edited later");
});
await test("engine: another tab announcing a newer save puts this window behind before it saves anything", () => {
  const server = fakeServer();
  const row = server.seed("t1", "x");
  const { engine, last } = make({ server, parts: [{ taskId: "t1", content: "x" }] });
  engine.noteSavedElsewhere("t1", row.updatedAt);
  assert.equal(last().behind, null);
  engine.noteSavedElsewhere("t1", server.stamp());
  assert.equal(last().behind?.via, "tab");
});
await test("engine: restore - unsaved text typed on the version the server still has comes back and is saved", async () => {
  const server = fakeServer();
  const row = server.seed("t1", "saved earlier");
  const storage = memoryStorage();
  storage.setItem(backupKey("t:1"), JSON.stringify({ v: 1, tasks: { t1: { text: "saved earlier plus words lost on a crash", base: row.updatedAt, dirty: true, at: Date.now() } } }));
  const { engine, last } = make({ server, storage, parts: [{ taskId: "t1", content: "saved earlier" }] });
  assert.equal(engine.restore(), true);
  assert.equal(engine.getText("t1"), "saved earlier plus words lost on a crash");
  await waitFor(() => last().saveState === "saved");
  assert.equal(server.rows.get("t1").content, "saved earlier plus words lost on a crash");
});
await test("engine: restore - a local copy older than the server's is not put back", () => {
  const server = fakeServer();
  server.seed("t1", "newer on the server");
  const storage = memoryStorage();
  storage.setItem(backupKey("t:1"), JSON.stringify({ v: 1, tasks: { t1: { text: "old local", base: "2026-10-05T09:00:00.000Z", dirty: true, at: Date.parse("2026-10-05T09:30:00.000Z") } } }));
  const { engine } = make({ server, storage, parts: [{ taskId: "t1", content: "newer on the server" }] });
  assert.equal(engine.restore(), false);
  assert.equal(engine.getText("t1"), "newer on the server");
});
await test("engine: flush saves everything and reports true; with the server down it times out and reports false", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  server.seed("t2", "");
  const { engine } = make({ server, parts: [{ taskId: "t1", content: "" }, { taskId: "t2", content: "" }] });
  engine.setText("t1", "one");
  engine.setText("t2", "two");
  assert.equal(await engine.flush(2000), true);
  assert.equal(server.rows.get("t1").content, "one");
  assert.equal(server.rows.get("t2").content, "two");
  server.offline = true;
  engine.setText("t1", "one more");
  assert.equal(await engine.flush(150), false);
  assert.equal(engine.hasUnsaved(), true);
  assert.equal(engine.snapshot().find((s) => s.taskId === "t1").content, "one more");
  engine.dispose();
});
await test("engine: time up from the server stops the retry loop but keeps the text", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  const { engine, last } = make({ server, parts: [{ taskId: "t1", content: "" }] });
  server.timeUp = true;
  engine.setText("t1", "late words");
  await waitFor(() => last().timeUp);
  const n = server.saves.length;
  await sleep(150);
  assert.equal(server.saves.length, n);
  assert.equal(engine.getText("t1"), "late words");
});
await test("engine: an essay handed in from another tab is noticed", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  const { engine, last } = make({ server, parts: [{ taskId: "t1", content: "" }] });
  server.submitted = true;
  engine.setText("t1", "x");
  await waitFor(() => last().handedInElsewhere);
});
await test("engine: finish clears the browser copy and stops everything", () => {
  const server = fakeServer();
  server.seed("t1", "");
  const storage = memoryStorage();
  const { engine } = make({ server, storage, parts: [{ taskId: "t1", content: "" }] });
  engine.setText("t1", "done");
  assert.ok(storage.getItem(backupKey("t:1")));
  engine.finish();
  assert.equal(storage.getItem(backupKey("t:1")), null);
  engine.setText("t1", "ignored");
  assert.equal(engine.getText("t1"), "done");
  assert.equal(engine.hasUnsaved(), false);
});
await test("engine: storage that throws never breaks typing", async () => {
  const server = fakeServer();
  server.seed("t1", "");
  const broken = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("full"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  const { engine, last } = make({ server, storage: broken, parts: [{ taskId: "t1", content: "" }] });
  assert.equal(engine.restore(), false);
  engine.setText("t1", "still saved to the server");
  await waitFor(() => last().saveState === "saved");
  assert.equal(server.rows.get("t1").content, "still saved to the server");
  engine.finish();
});

console.log(`\n${passed} passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
