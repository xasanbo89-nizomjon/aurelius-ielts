function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
}

/** True for errors that mean "the user backed out" — don't show a toast for these. */
export function isUserCancelledAuthError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
}

/** Maps a Firebase Auth error to copy a student/teacher would actually understand. */
export function firebaseAuthErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
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
    case "auth/configuration-not-found":
    case "auth/invalid-api-key":
      return "Sign-in isn't configured yet — ask your administrator to set up Firebase.";
    default:
      return "Something went wrong. Please try again.";
  }
}
