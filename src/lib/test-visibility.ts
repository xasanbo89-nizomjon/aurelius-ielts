/**
 * Phase G0 — which tests a STUDENT may be shown.
 *
 * A test is internal / temporary when its title starts with an underscore
 * ("_phaseH_tmp_…", "__demo"). The schema has no flag for this, so the title
 * prefix is the marker for now — every student-facing list, the What's New feed,
 * the recommendations and the start page go through this one rule, so a scratch
 * test can never reach a student however it got published. Teachers see all of
 * their tests as before.
 *
 * The rule is applied in code, on purpose: Prisma's `startsWith` hands the text to SQL `LIKE`,
 * where "_" is a one-character wildcard, so `startsWith: "_"` matches EVERY title and would hide every test.
 */
export const INTERNAL_TITLE_PREFIX = "_";

export function isInternalTestTitle(title: string | null | undefined): boolean {
  return (title ?? "").startsWith(INTERNAL_TITLE_PREFIX);
}

/** The rows a student may see: everything except temporary / internal tests. */
export function withoutInternalTests<T extends { title: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isInternalTestTitle(row.title));
}
