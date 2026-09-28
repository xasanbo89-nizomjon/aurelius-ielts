/**
 * Phase 30 — Part 2/3. NEXT_PUBLIC_TELEGRAM_OWNER_USERNAME is real
 * configuration, never a secret (it's the literal, visible destination of
 * the t.me link the button opens) — safe to read client-side, and
 * deliberately never hardcoded per spec. Returns null when unset so the
 * button can show a clear "not configured yet" state instead of opening a
 * broken link.
 */
export function getTelegramOwnerUsername(): string | null {
  const username = process.env.NEXT_PUBLIC_TELEGRAM_OWNER_USERNAME?.trim();
  return username ? username.replace(/^@/, "") : null;
}

export function buildTelegramPurchaseMessage(planTitle: string, studentEmail: string, studentId: string): string {
  return ["Hello.", "", "I want to purchase:", planTitle, "", "Account:", studentEmail, "", "Student ID:", studentId].join("\n");
}

export function buildTelegramPurchaseUrl(planTitle: string, studentEmail: string, studentId: string): string | null {
  const username = getTelegramOwnerUsername();
  if (!username) return null;

  const message = buildTelegramPurchaseMessage(planTitle, studentEmail, studentId);
  return `https://t.me/${username}?text=${encodeURIComponent(message)}`;
}
