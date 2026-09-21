/** Short client-side id for authoring UI only (choices, prompts, options) — never used as a DB id. */
export function genId(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
