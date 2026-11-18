function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
}

/** True for errors that mean "the user backed out" — don't show a toast for these. */
export function isUserCancelledAuthError(error: unknown): boolean {
  const code = errorCode(error);
  return (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/user-cancelled"
  );
}

/** Maps a Firebase Auth error to copy a student/teacher would actually understand. */
export function firebaseAuthErrorMessage(error: unknown): string {
  const code = errorCode(error);
  console.warn("[FirebaseAuth Error Caught]:", { code, error });

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Choose a stronger password (at least 8 characters).";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error — check your connection and try again.";
    case "auth/popup-blocked":
      return "Pop-up was blocked by Safari/browser. Please allow pop-ups or use Google sign-in again.";
    case "auth/web-storage-unsupported":
      return "Storage or cookies are blocked (e.g. Safari Private Mode). Please enable cookies or turn off private browsing.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized for authentication in Firebase.";
    case "auth/requires-recent-login":
      return "Please log in again to continue.";
    case "auth/internal-error":
      return "Authentication service error. Please refresh and try again.";
    case "auth/configuration-not-found":
    case "auth/invalid-api-key":
      return "Sign-in isn't configured yet — ask your administrator to set up Firebase.";
    default:
      if (error instanceof Error && error.message && !error.message.includes("auth/")) {
        return error.message;
      }
      return "Something went wrong. Please try again.";
  }
}
