// Phase R - the pure rules of the small UX fixes, with no database and no network.
//
//   npm run check:r
//
//   price      "$9", "$9.50", "90 000 so'm"; the plan form's checks (currency, decimals, badge, features, Telegram link); moving an item in an ordered list
//   colours    the highlighter's colour rules: same colour merges, another colour recolours (the old highlight is cut around it, its note stays), nothing overlaps
//   guards     the Subscription page only redirects; no sidebar item points at it; every plan action checks Root on the server
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatPlanPrice, moveId, planInputSchema } from "@/lib/premium-plan-rules";
import { colorOf, isHighlightColor, planHighlight } from "@/lib/exam/highlight-colors";

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

// ---- price -----------------------------------------------------------------------------------------------------------------
check("USD whole and with cents", () => {
  assert.equal(formatPlanPrice(9, "USD"), "$9");
  assert.equal(formatPlanPrice(25, "USD"), "$25");
  assert.equal(formatPlanPrice(70, "USD"), "$70");
  assert.equal(formatPlanPrice(9.5, "USD"), "$9.50");
  assert.equal(formatPlanPrice(1200, "USD"), "$1,200");
});
check("UZS groups thousands", () => {
  assert.equal(formatPlanPrice(90000, "UZS"), "90 000 so'm");
  assert.equal(formatPlanPrice(1250000, "UZS"), "1 250 000 so'm");
  assert.equal(formatPlanPrice(500, "UZS"), "500 so'm");
});

const valid = { name: "1 Month", durationDays: "30", price: "9", currency: "USD", badge: "", features: ["AI Writing", "  ", "AI Speaking"], telegramLink: "", isActive: true };
check("a good plan passes; blank features are dropped; text numbers are read", () => {
  const parsed = planInputSchema.safeParse(valid);
  assert.ok(parsed.success, parsed.error?.issues[0]?.message);
  assert.deepEqual(parsed.data.features, ["AI Writing", "AI Speaking"]);
  assert.equal(parsed.data.price, 9);
  assert.equal(parsed.data.badge, null);
  assert.equal(parsed.data.telegramLink, null);
});
check("bad plans are refused with a reason", () => {
  const bad = (patch) => planInputSchema.safeParse({ ...valid, ...patch });
  assert.ok(!bad({ name: "  " }).success);
  assert.ok(!bad({ durationDays: "0" }).success);
  assert.ok(!bad({ durationDays: "2.5" }).success);
  assert.ok(!bad({ price: "-1" }).success);
  assert.ok(!bad({ currency: "EUR" }).success);
  assert.ok(!bad({ currency: "UZS", price: "90000.5" }).success);
  assert.ok(!bad({ price: "9.999" }).success);
  assert.ok(!bad({ badge: "HOT" }).success);
  assert.ok(!bad({ telegramLink: "http://evil.example/x" }).success);
  assert.ok(!bad({ telegramLink: "javascript:alert(1)" }).success);
  assert.ok(!bad({ features: Array.from({ length: 21 }, (_, i) => `f${i}`) }).success);
  assert.ok(bad({ currency: "UZS", price: "90000", badge: "BEST VALUE", telegramLink: "https://t.me/aurelius_ielts" }).success);
});
check("moving an item in an ordered list", () => {
  assert.deepEqual(moveId(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveId(["a", "b", "c"], "b", 1), ["a", "c", "b"]);
  assert.deepEqual(moveId(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(moveId(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
});

// ---- colours ---------------------------------------------------------------------------------------------------------------
const TEXT = "The quick brown fox jumps over the lazy dog again and again";
const at = (start, end) => ({ region: "passage:p1", start, end, regionText: TEXT });
const hl = (id, start, end, color, note = null) => ({ id, region: "passage:p1", start, end, text: TEXT.slice(start, end), color, note });

check("colour names", () => {
  assert.ok(isHighlightColor("BLUE") && isHighlightColor("GREEN") && !isHighlightColor("PINK") && !isHighlightColor(undefined));
  assert.equal(colorOf({}), "YELLOW");
  assert.equal(colorOf({ color: "RED" }), "RED");
});
check("a fresh selection is one new highlight in the chosen colour", () => {
  const plan = planHighlight([], at(4, 9), "BLUE");
  assert.equal(plan.adds.length, 1);
  assert.deepEqual([plan.adds[0].start, plan.adds[0].end, plan.adds[0].color, plan.adds[0].text], [4, 9, "BLUE", "quick"]);
  assert.equal(plan.removes.length, 0);
});
check("the same colour again changes nothing", () => {
  assert.equal(planHighlight([hl("a", 4, 9, "YELLOW")], at(4, 9), "YELLOW"), null);
  assert.equal(planHighlight([hl("a", 4, 9)], at(5, 8), "YELLOW"), null); // inside an uncoloured (= yellow) highlight
});
check("same colour that touches merges and keeps the notes", () => {
  const plan = planHighlight([hl("a", 4, 9, "YELLOW", "first")], at(9, 15), "YELLOW");
  assert.equal(plan.adds.length, 1);
  assert.deepEqual([plan.adds[0].start, plan.adds[0].end], [4, 15]);
  assert.equal(plan.adds[0].note, "first");
  assert.deepEqual(plan.removes.map((h) => h.id), ["a"]);
});
check("another colour recolours that stretch; the old highlight is cut around it and keeps its note on its first piece", () => {
  const plan = planHighlight([hl("a", 0, 19, "YELLOW", "keep me")], at(4, 9), "BLUE");
  const byColour = (c) => plan.adds.filter((a) => a.color === c);
  assert.equal(byColour("BLUE").length, 1);
  assert.deepEqual([byColour("BLUE")[0].start, byColour("BLUE")[0].end], [4, 9]);
  const yellow = byColour("YELLOW");
  assert.equal(yellow.length, 2); // "The" and "brown fox"
  assert.equal(yellow[0].note, "keep me");
  assert.equal(yellow[1].note, null);
  assert.deepEqual(plan.removes.map((h) => h.id), ["a"]);
  // nothing overlaps afterwards
  for (const a of plan.adds) for (const b of plan.adds) if (a !== b) assert.ok(a.end <= b.start || b.end <= a.start, `${a.start}-${a.end} overlaps ${b.start}-${b.end}`);
});
check("a different colour next to (not over) another does not touch it", () => {
  const plan = planHighlight([hl("a", 4, 9, "YELLOW")], at(10, 15), "RED");
  assert.equal(plan.removes.length, 0);
  assert.equal(plan.adds.length, 1);
});
check("another region is never touched", () => {
  const other = { ...hl("z", 4, 9, "YELLOW"), region: "question:q1:prompt" };
  const plan = planHighlight([other], at(4, 9), "BLUE");
  assert.equal(plan.removes.length, 0);
});

// ---- guards ----------------------------------------------------------------------------------------------------------------
check("the Subscription page only redirects to Premium", () => {
  const page = read("src/app/(dashboard)/student/subscription/page.tsx");
  assert.match(page, /redirect\(/);
  assert.match(page, /\/student\/premium/);
  assert.ok(!/prisma|getSubscriptionSummary/.test(page));
});
check("no sidebar item or page link points at /student/subscription", () => {
  assert.ok(!read("src/lib/nav-config.ts").includes("/student/subscription"));
  assert.ok(!read("src/components/layout/premium-nav-badge.tsx").includes("/student/subscription"));
});
check("every plan action checks Root on the server", () => {
  const actions = read("src/actions/premium-plans.actions.ts");
  const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.equal(exported.length, 4);
  for (const name of exported) {
    const body = actions.slice(actions.indexOf(`export async function ${name}`)).split("\nexport async function ")[0];
    assert.ok(body.includes("requireRoot()"), `${name} does not call requireRoot()`);
  }
  assert.match(actions, /isRootTeacher/);
  assert.match(read("src/app/(dashboard)/teacher/premium-plans/page.tsx"), /isRootTeacher/);
});
check("the student Premium page reads plans from the database, with no price written in it", () => {
  const page = read("src/app/(dashboard)/student/premium/page.tsx");
  assert.match(page, /listPlansForStudents/);
  assert.ok(!/ACTIVE_PREMIUM_PLANS|\$\d/.test(page));
});
check("a purchase request stores the name, price and currency it was made at", () => {
  const lib = read("src/lib/premium-requests.ts");
  for (const field of ["planName", "priceLabel", "priceAmount", "priceCurrency"]) assert.ok(lib.includes(field), field);
});
check("the highlight toolbar replaces the three-dot button", () => {
  const ui = read("src/components/exam/official/official-annotations.tsx");
  assert.ok(!ui.includes("annotation-opener"));
  assert.match(ui, /annotation-toolbar/);
  assert.match(ui, /FIELD/);
});

console.log(`\ncheck:r - ${passed} checks passed${process.exitCode ? " (some FAILED)" : ""}`);
