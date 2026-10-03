// Phase G0 — one-off, idempotent clean-up of EXISTING Reading passages that were imported from a PDF with its hard line breaks.
//
//   npm run passages:normalize                         DRY RUN over every Reading passage — prints what would change, writes nothing
//   npm run passages:normalize -- --test <mockTestId>  limit to one test
//   npm run passages:normalize -- --details            also print every hyphen join and every moved highlight
//   npm run passages:normalize -- --apply              write the changes (a backup file is written FIRST)
//   npm run passages:normalize -- --restore <file>     put a backup file's passages and highlights back exactly as they were
//   npm run passages:normalize -- --include-single-block   also tidy passages that have no blank line at all (see below)
//
// A passage with no blank line at all marks its paragraphs only by where lines end, which cannot be told apart from a hard wrap — joining
// it would turn every paragraph into one. Those passages are listed and left alone unless --include-single-block is given.
//
// Why a migration (and not render-time clean-up): a saved highlight is a character range into Passage.content. Changing the text while
// leaving the highlights alone would move them onto the wrong words, so each passage and ITS highlights are changed together, in one
// transaction, with every highlight carried through the same character map the text went through. A highlight that cannot be placed on
// the same words is left untouched and reported — nothing a student saved is ever deleted.
//
// Safe to run again: a passage that is already tidy is skipped (the normaliser is idempotent), and each write only happens if the
// passage still has the text this run read.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

import { normalizePassageWithMap, remapStoredHighlight } from "@/lib/text/normalizePassage";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const apply = flag("--apply");
const details = flag("--details");
const includeSingleBlock = flag("--include-single-block");
const onlyTest = value("--test");
const restoreFile = value("--restore");

const db = new PrismaClient();
const BACKUP_DIR = path.join(process.cwd(), "scripts", ".backups");

async function restore(file) {
  const backup = JSON.parse(readFileSync(file, "utf8"));
  let passages = 0;
  let highlights = 0;
  for (const passage of backup.passages) {
    await db.$transaction([
      db.passage.update({ where: { id: passage.id }, data: { content: passage.content } }),
      ...passage.highlights.map((h) => db.highlight.update({ where: { id: h.id }, data: { text: h.text, startOffset: h.startOffset, endOffset: h.endOffset } })),
    ]);
    passages++;
    highlights += passage.highlights.length;
  }
  console.log(`Restored ${passages} passage(s) and ${highlights} highlight(s) from ${file}.`);
}

try {
  if (restoreFile) {
    await restore(restoreFile);
  } else {
    const passages = await db.passage.findMany({
      where: { mockTest: { type: "READING", ...(onlyTest ? { id: onlyTest } : {}) } },
      orderBy: [{ mockTestId: "asc" }, { orderIndex: "asc" }],
      select: { id: true, title: true, content: true, orderIndex: true, mockTest: { select: { id: true, title: true, isPublished: true } } },
    });
    const highlightRows = await db.highlight.findMany({
      where: { passageId: { in: passages.map((p) => p.id) } },
      select: { id: true, passageId: true, text: true, startOffset: true, endOffset: true },
    });
    const highlightsByPassage = new Map();
    for (const row of highlightRows) highlightsByPassage.set(row.passageId, [...(highlightsByPassage.get(row.passageId) ?? []), row]);

    console.log(`${apply ? "APPLY" : "DRY RUN"} — ${passages.length} Reading passage(s)${onlyTest ? ` in test ${onlyTest}` : ""}${apply ? "" : " (nothing is written)"}\n`);

    const plan = [];
    const leftAlone = [];
    let alreadyTidy = 0;
    for (const passage of passages) {
      const result = normalizePassageWithMap(passage.content);
      if (!result.changed) {
        alreadyTidy++;
        continue;
      }
      const labelOf = () => `${passage.mockTest.title.slice(0, 28)}${passage.mockTest.isPublished ? "" : " [draft]"} · Part ${passage.orderIndex + 1} "${passage.title.slice(0, 28)}"`;
      if (!includeSingleBlock && !/\n\s*\n/.test(passage.content) && passage.content.split("\n").length > 3) {
        leftAlone.push(passage);
        console.log(`• ${labelOf()}\n    LEFT ALONE: no blank line anywhere, so its paragraph ends are only visible as line ends and joining the lines would merge every paragraph into one.\n    Add a blank line between its paragraphs in the editor (or re-import it), or run with --include-single-block to join it anyway.`);
        continue;
      }
      const stored = highlightsByPassage.get(passage.id) ?? [];
      const moved = [];
      const stuck = [];
      for (const row of stored) {
        const to = remapStoredHighlight(passage.content, result.text, result.offsetMap, row);
        if (to) moved.push({ row, to });
        else stuck.push(row);
      }

      const hyphens = [...passage.content.matchAll(/(\p{L}+)-[ \t]*\r?\n[ \t]*(\p{L}+)/gu)].map((m) => {
        const outStart = result.offsetMap[m.index];
        const kept = result.text.slice(outStart, outStart + m[1].length + 1).endsWith("-");
        return `${m[1]}-⏎${m[2]} → ${kept ? `${m[1]}-${m[2]} (hyphen kept: a compound)` : `${m[1]}${m[2]}`}`;
      });

      plan.push({ passage, result, moved, stuck, hyphens });
      console.log(
        `• ${labelOf()}\n    ${passage.content.length} → ${result.text.length} characters, ${passage.content.split("\n").length} → ${result.text.split("\n").length} lines, ${hyphens.length} hyphenated line-end word(s), ${stored.length} highlight(s)${stored.length ? ` (${moved.length} moved${stuck.length ? `, ${stuck.length} could not be placed — left untouched` : ""})` : ""}`
      );
      if (details) {
        for (const h of hyphens) console.log(`      hyphen: ${h}`);
        for (const { row, to } of moved) console.log(`      highlight ${row.id.slice(-6)}: [${row.startOffset},${row.endOffset}) ${JSON.stringify(row.text.slice(0, 40))} → [${to.startOffset},${to.endOffset}) ${JSON.stringify(to.text.slice(0, 40))}`);
        for (const row of stuck) console.log(`      highlight ${row.id.slice(-6)} NOT PLACED: ${JSON.stringify(row.text.slice(0, 60))}`);
      }
    }

    const totalHighlights = plan.reduce((sum, p) => sum + p.moved.length, 0);
    console.log(`\n${plan.length} passage(s) to tidy, ${alreadyTidy} already tidy${leftAlone.length ? `, ${leftAlone.length} left alone (no blank lines)` : ""}, ${totalHighlights} highlight(s) to move, ${plan.reduce((s, p) => s + p.stuck.length, 0)} highlight(s) that cannot be placed.`);

    if (!apply) {
      console.log(plan.length ? `\nDry run only — nothing was changed. To apply:  npm run passages:normalize -- ${onlyTest ? `--test ${onlyTest} ` : ""}--apply` : "\nNothing to do.");
    } else if (plan.length > 0) {
      mkdirSync(BACKUP_DIR, { recursive: true });
      const backupFile = path.join(BACKUP_DIR, `passages-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      writeFileSync(
        backupFile,
        JSON.stringify({ createdAt: new Date().toISOString(), passages: plan.map((p) => ({ id: p.passage.id, content: p.passage.content, highlights: (highlightsByPassage.get(p.passage.id) ?? []).map(({ id, text, startOffset, endOffset }) => ({ id, text, startOffset, endOffset })) })) }, null, 2)
      );
      console.log(`\nBackup written: ${backupFile}`);

      let written = 0;
      let skipped = 0;
      for (const { passage, result, moved } of plan) {
        // Only if the passage still holds the text this run read — a teacher edit made meanwhile is never overwritten.
        const outcome = await db.$transaction(async (tx) => {
          const changed = await tx.passage.updateMany({ where: { id: passage.id, content: passage.content }, data: { content: result.text } });
          if (changed.count === 0) return false;
          for (const { row, to } of moved) await tx.highlight.update({ where: { id: row.id }, data: { text: to.text, startOffset: to.startOffset, endOffset: to.endOffset } });
          return true;
        });
        if (outcome) written++;
        else skipped++;
      }
      console.log(`Done: ${written} passage(s) updated${skipped ? `, ${skipped} skipped (changed while this ran — run it again)` : ""}.\nTo undo:  npm run passages:normalize -- --restore "${backupFile}"`);
    }
  }
} finally {
  await db.$disconnect();
}
