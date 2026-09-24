import "server-only";
import type { PaymentProvider as PaymentProviderType } from "@prisma/client";

/**
 * Phase 26 — Payment Architecture. A real, typed abstraction every future
 * gateway integration implements — deliberately not connected to a real
 * gateway yet, per the spec. Calling `createCharge` today always returns a
 * clear NOT_CONNECTED result rather than a fake success, so nothing here
 * can be mistaken for a working payment.
 */
export type CreateChargeInput = { amountMinorUnits: number; currency: string; studentId: string; description: string };
export type CreateChargeResult =
  | { status: "NOT_CONNECTED"; message: string }
  | { status: "REDIRECT"; redirectUrl: string; providerPaymentId: string }
  | { status: "FAILED"; message: string };

export interface PaymentProviderAdapter {
  readonly provider: PaymentProviderType;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  checkStatus(providerPaymentId: string): Promise<"PENDING" | "COMPLETED" | "FAILED">;
}

function createUnconnectedProvider(provider: PaymentProviderType): PaymentProviderAdapter {
  return {
    provider,
    async createCharge() {
      return { status: "NOT_CONNECTED", message: `${provider} is not connected yet — architecture only, per Phase 26.` };
    },
    async checkStatus() {
      return "PENDING";
    },
  };
}

const PROVIDERS: Record<PaymentProviderType, PaymentProviderAdapter> = {
  CLICK: createUnconnectedProvider("CLICK"),
  PAYME: createUnconnectedProvider("PAYME"),
};

export function getPaymentProvider(provider: PaymentProviderType): PaymentProviderAdapter {
  return PROVIDERS[provider];
}
