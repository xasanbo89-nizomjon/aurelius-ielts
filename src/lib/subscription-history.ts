import "server-only";

import { prisma } from "@/lib/prisma";

export type SubscriptionHistoryEntry = {
  key: string;
  at: Date;
  label: string;
  detail: string;
  source: "TRIAL_MANAGEMENT" | "PAYMENT";
};

/**
 * Phase 26 — Subscription Management "Show full history" (Phase 48 removed
 * the coin-redemption source — the coin economy tables are gone). The
 * Subscription row itself is mutated in place (never one row per change —
 * see src/lib/trial-management.ts), so this is a real, merged view across
 * the 2 tables that together ARE the actual change history: TrialAuditLog
 * (resets/extends/admin grants/removes/Telegram approvals) and real Payment
 * attempts. A student's "via Coin Redemption" badge on their Current Plan
 * card (reading Subscription.source directly) still shows that real
 * historical fact even though it no longer appears as a line item here.
 */
export async function getSubscriptionHistory(studentId: string): Promise<SubscriptionHistoryEntry[]> {
  const [auditLogs, payments] = await Promise.all([
    prisma.trialAuditLog.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
    prisma.payment.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }),
  ]);

  const AUDIT_LABEL: Record<string, string> = {
    TRIAL_RESET_90: "Trial reset (90 days)",
    TRIAL_EXTEND_30: "Trial extended (+30 days)",
    PREMIUM_GRANT: "Premium granted by admin",
    PREMIUM_REMOVE: "Premium removed by admin",
  };

  const entries: SubscriptionHistoryEntry[] = [
    ...auditLogs.map((log) => ({
      key: `audit-${log.id}`,
      at: log.createdAt,
      label: AUDIT_LABEL[log.action] ?? log.action,
      detail: `New expiry: ${log.newExpiryDate.toLocaleDateString()}`,
      source: "TRIAL_MANAGEMENT" as const,
    })),
    ...payments.map((payment) => ({
      key: `payment-${payment.id}`,
      at: payment.createdAt,
      label: `Payment ${payment.status.toLowerCase()}${payment.providerType ? ` via ${payment.providerType}` : ""}`,
      detail: `${payment.currency} ${payment.amount.toFixed(2)}`,
      source: "PAYMENT" as const,
    })),
  ];

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}
