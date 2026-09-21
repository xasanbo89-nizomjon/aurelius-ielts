/**
 * Plain constants with zero dependencies — safe to import from the Edge
 * middleware, unlike `@/lib/firebase/admin` (which pulls in the Node-only
 * firebase-admin SDK and would break the Edge bundle).
 */
export const SESSION_COOKIE_NAME = "session";
/** Firebase's own maximum session cookie lifetime is 14 days. */
export const SESSION_COOKIE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
