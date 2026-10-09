// Phase M3 - the rules of the automatic review content, with no database and no network.
//
//   npm run check:m3
//
//   states     an AUTO explanation is shown to students (until a teacher takes it back); a draft and an outdated one are not
//   evidence   an AUTO item is stored as CONFIRMED (students see it), reads back, and a teacher's item is never replaced by it
//   prompt     the request names every question number, handles Not Given and asks for exact quotes; the reply is checked
//   guards     publishing queues the job; no student page can call the AI; the review sends no text to a student without Premium; the badge closes the span
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { explanationState, isShownToStudents } from "@/lib/exam/question-explanations";
import { locateQuote, makeItem, parseEvidence, serializeEvidence, withItem } from "@/lib/exam/answer-evidence-store";
import { buildReviewContentPrompt, reviewContentResponseSchema, REVIEW_CONTENT_JSON_SCHEMA } from "@/lib/ai/prompts/review-content";

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL  ${name}\n      ${String(error?.message ?? error).split("\n")[0]}`);
    process.exitCode = 1;
  }
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

// ---- states ----------------------------------------------------------------------------------------------------------------
check("an AUTO explanation that still matches is shown to students", () => {
  assert.equal(explanationState({ status: "AUTO", sourceHash: "h" }, "h"), "AUTO");
  assert.ok(isShownToStudents("AUTO") && isShownToStudents("APPROVED"));
});
check("a draft, a missing one and an outdated one are not shown", () => {
  assert.ok(!isShownToStudents(explanationState({ status: "DRAFT", sourceHash: "h" }, "h")));
  assert.ok(!isShownToStudents(explanationState(null, "h")));
  assert.equal(explanationState({ status: "AUTO", sourceHash: "old" }, "new"), "OUTDATED");
  assert.ok(!isShownToStudents("OUTDATED"));
});

// ---- evidence --------------------------------------------------------------------------------------------------------------
const TEXT = "Sundews catch insects on sticky leaves. The Venus flytrap closes its leaves in under a second. Pitcher plants drown their prey.";
check("an automatic evidence item is CONFIRMED, reads back, and keeps its source", () => {
  const span = locateQuote(TEXT, "The Venus flytrap closes its leaves in under a second.");
  assert.ok(span);
  const item = makeItem({ content: TEXT, passageId: "p1", slot: 0, start: span.start, end: span.end, state: "CONFIRMED", source: "AUTO" });
  const back = parseEvidence(serializeEvidence([item]));
  assert.equal(back.length, 1);
  assert.deepEqual([back[0].state, back[0].source, back[0].quote], ["CONFIRMED", "AUTO", "The Venus flytrap closes its leaves in under a second."]);
});
check("a quote that is not in the text is not found (nothing invented is stored)", () => {
  assert.equal(locateQuote(TEXT, "Venus flytraps close in half a second."), null);
  assert.ok(locateQuote(TEXT, "the venus  flytrap closes"), "case and spacing differences are tolerated");
});
check("a teacher's edit replaces an automatic item, and the job skips a number that already has one", () => {
  const teacher = makeItem({ content: TEXT, passageId: "p1", slot: 0, start: 0, end: 38, state: "CONFIRMED", source: "TEACHER" });
  const auto = makeItem({ content: TEXT, passageId: "p1", slot: 0, start: 39, end: 90, state: "CONFIRMED", source: "AUTO" });
  assert.equal(withItem([auto], teacher)[0].source, "TEACHER");
  assert.match(read("src/lib/review-content/generate.ts"), /existing\.slot === item\.slot\)\) continue/);
});

// ---- the request -----------------------------------------------------------------------------------------------------------
const context = { testType: "READING", texts: [{ title: "Plants", text: TEXT }], questionTypeLabel: "True / False / Not Given", numberLabel: "7", prompt: "Pitcher plants float.", optionLines: [], answerLines: ["NOT GIVEN"], numbers: [7], isSet: false, yesNo: false, notGiven: true };
check("the request lists the numbers, the text, and says what Not Given means", () => {
  const { system, user } = buildReviewContentPrompt(context);
  assert.match(user, /Give evidence for these question numbers: 7\./);
  assert.match(user, /Sundews catch insects/);
  assert.match(user, /NOT GIVEN/);
  assert.match(system, /Not Given/);
  assert.match(system, /EXACTLY/);
});
check("a multi-number question asks for every number", () => {
  assert.match(buildReviewContentPrompt({ ...context, numbers: [21, 22], numberLabel: "21-22", isSet: true, notGiven: false }).user, /21, 22/);
});
check("the reply is checked: the shape is strict and a bad reply is refused", () => {
  assert.ok(reviewContentResponseSchema.safeParse({ evidence: [{ number: 7, found: false, quote: "" }], explanation: "x", trap: "y", fix: "z" }).success);
  assert.ok(!reviewContentResponseSchema.safeParse({ evidence: "none", explanation: "x", trap: "y", fix: "z" }).success);
  assert.ok(!reviewContentResponseSchema.safeParse({ explanation: "x", trap: "y", fix: "z" }).success);
  assert.deepEqual(REVIEW_CONTENT_JSON_SCHEMA.required, ["evidence", "explanation", "trap", "fix"]);
  assert.equal(REVIEW_CONTENT_JSON_SCHEMA.additionalProperties, false);
});

// ---- guards ----------------------------------------------------------------------------------------------------------------
check("publishing a test queues its review content (and never fails the publish)", () => {
  const source = read("src/lib/exam/test-management.ts");
  assert.match(source, /queueReviewContent/);
  assert.match(source, /isPublished && !test\.isPublished/);
  assert.match(source, /catch \(error\)[\s\S]{0,200}could not queue/);
});
check("the scheduled job continues unfinished review content", () => {
  assert.match(read("src/app/api/cron/speaking-audio/route.ts"), /processDueReviewContent/);
});
check("no student page or review component can reach the AI", () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(path.join(root, dir))) {
      const full = path.join(dir, name);
      if (statSync(path.join(root, full)).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(full);
    }
  };
  ["src/app/(exam)/student/exam/attempt/[resultId]/review", "src/components/exam/official"].forEach(walk);
  assert.ok(files.length > 5);
  for (const file of files) assert.ok(!/@\/lib\/ai\/|review-content\/(generate|processing)|generateReviewContent|explainMoreAction/.test(read(file)), `${file} reaches the AI`);
});
check("a student without Premium is sent no explanation text", () => {
  const page = read("src/app/(exam)/student/exam/attempt/[resultId]/review/page.tsx");
  assert.match(page, /hasActiveAccess\(profile\.id\)/);
  assert.match(page, /explain: null, trap: null, fix: null, locked: true/);
});
check("the Premium prompt links to the Premium page and the pills read as asked", () => {
  const ctx = read("src/components/exam/official/official-review-context.tsx");
  assert.match(ctx, /Available with Premium/);
  assert.match(ctx, /href="\/student\/premium"/);
  assert.ok(ctx.includes("Explain more ▸"));
  assert.ok(ctx.includes("What's the trap? 💡"));
});
check("the evidence badge closes the green span", () => {
  const passage = read("src/components/exam/official/official-passage.tsx");
  assert.match(passage, /byEnd\.set\(item\.end/);
  assert.ok(!/byStart/.test(passage));
});
check("single-number rows put the line 'number, tick, Answer, pills' before the question text", () => {
  assert.ok((read("src/components/exam/official/official-questions.tsx").match(/<RowReviewHead/g) ?? []).length >= 3);
});
check("the daily limit counts only manual requests", () => {
  assert.match(read("src/lib/ai/explanation-generation.ts"), /kind: "MANUAL"/);
});

console.log(`\ncheck:m3 - ${passed} checks passed${process.exitCode ? " (some FAILED)" : ""}`);
