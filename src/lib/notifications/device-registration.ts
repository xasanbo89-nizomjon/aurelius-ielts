import "server-only";

/**
 * Phase 28 — Push Notification Preparation, device registration
 * abstraction. Architecture only, per spec — deliberately NO new database
 * model (Phase 28 rule: don't change schema unless absolutely required).
 * This in-memory map is explicitly NOT durable (cleared on every server
 * restart/redeploy, never shared across serverless instances) — it exists
 * only so the real registerDevice()/getDevicesForStudent() call shape is
 * settled now. A future phase swaps the body for a real `DeviceToken`
 * Prisma model without changing any caller.
 */
export type DevicePlatform = "WEB" | "IOS" | "ANDROID";

export type DeviceRegistration = {
  studentId: string;
  token: string;
  platform: DevicePlatform;
  registeredAt: Date;
};

const IN_MEMORY_REGISTRY = new Map<string, DeviceRegistration>();

export async function registerDevice(studentId: string, token: string, platform: DevicePlatform): Promise<DeviceRegistration> {
  const registration: DeviceRegistration = { studentId, token, platform, registeredAt: new Date() };
  IN_MEMORY_REGISTRY.set(token, registration);
  return registration;
}

export async function unregisterDevice(token: string): Promise<void> {
  IN_MEMORY_REGISTRY.delete(token);
}

export async function getDevicesForStudent(studentId: string): Promise<DeviceRegistration[]> {
  return [...IN_MEMORY_REGISTRY.values()].filter((d) => d.studentId === studentId);
}
