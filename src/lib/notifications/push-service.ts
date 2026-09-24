import "server-only";

/**
 * Phase 28 — Push Notification Preparation. Architecture only, per spec:
 * a real, typed abstraction every future push provider (Web Push/FCM/APNs)
 * implements, mirroring src/lib/payments/provider.ts's adapter pattern.
 * Deliberately not connected to a real provider and deliberately no new
 * database model — calling `send` today always returns a clear
 * NOT_CONNECTED result, and nothing here can be mistaken for a working
 * push notification.
 */
export type PushPayload = { title: string; body: string; url?: string };

export type SendPushResult =
  | { status: "NOT_CONNECTED"; message: string }
  | { status: "SENT"; messageId: string }
  | { status: "FAILED"; message: string };

export interface PushNotificationProvider {
  readonly name: string;
  send(deviceToken: string, payload: PushPayload): Promise<SendPushResult>;
}

function createUnconnectedPushProvider(name: string): PushNotificationProvider {
  return {
    name,
    async send() {
      return { status: "NOT_CONNECTED", message: `${name} is not connected yet — architecture only, per Phase 28.` };
    },
  };
}

const PROVIDER: PushNotificationProvider = createUnconnectedPushProvider("web-push");

/** The one place future code asks for "the" push provider — swapping in a real one later means implementing PushNotificationProvider and changing only this function. */
export function getPushProvider(): PushNotificationProvider {
  return PROVIDER;
}
