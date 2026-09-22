import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

export { SESSION_COOKIE_MAX_AGE_MS, SESSION_COOKIE_NAME } from "@/lib/firebase/constants";

let cachedApp: App | null = null;

/**
 * Lazily initializes the Admin app on first use (not at module load), so
 * importing this file never crashes pages that don't actually need to
 * verify a session — e.g. the marketing pages before Firebase credentials
 * are configured. Only an actual verification/sign-in attempt fails, with a
 * clear error, if `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` /
 * `FIREBASE_PRIVATE_KEY` are missing.
 */
function getFirebaseAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0]!;
    return cachedApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Service account keys are usually pasted into .env with literal "\n"
  // sequences rather than real newlines — un-escape them.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
    );
  }

  cachedApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return cachedApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
