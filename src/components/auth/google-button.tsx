"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getFirebaseAuth } from "@/lib/firebase/client";
import { firebaseAuthErrorMessage, isUserCancelledAuthError } from "@/lib/firebase/errors";
import { establishSessionAction } from "@/actions/session.actions";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/auth/google-icon";

export function GoogleButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Check for mobile redirect result on page load
  useEffect(() => {
    let active = true;
    try {
      const auth = getFirebaseAuth();
      getRedirectResult(auth)
        .then(async (credential) => {
          if (!active || !credential) return;
          setLoading(true);
          const idToken = await credential.user.getIdToken();
          const result = await establishSessionAction(idToken);

          if (!result.success) {
            toast.error(result.error);
            setLoading(false);
            return;
          }

          try {
            localStorage.setItem("aurelius_session_active", "true");
            localStorage.setItem("aurelius_user_role", result.role || "STUDENT");
          } catch {}

          const target = !result.hasProfile
            ? "/onboarding"
            : result.role === "TEACHER"
            ? "/teacher/dashboard"
            : "/student/dashboard";

          window.location.href = target;
        })
        .catch((error) => {
          if (!isUserCancelledAuthError(error)) {
            console.error("[Google Redirect Auth Error]", error);
            toast.error(firebaseAuthErrorMessage(error));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } catch {
      // Ignore if auth is not initialized during SSR
    }

    return () => {
      active = false;
    };
  }, [router]);

  async function handleClick() {
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      let credential;
      try {
        credential = await signInWithPopup(auth, provider);
      } catch (popupError: unknown) {
        const errObj = popupError && typeof popupError === "object" ? (popupError as { code?: string }) : null;
        // On Mobile Safari / iOS where popups are blocked by default:
        if (
          errObj?.code === "auth/popup-blocked" ||
          errObj?.code === "auth/cancelled-popup-request"
        ) {
          console.warn("[GoogleButton] Popup blocked or cancelled, falling back to redirect...");
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupError;
      }

      const idToken = await credential.user.getIdToken();
      const result = await establishSessionAction(idToken);
      if (!result.success) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      try {
        localStorage.setItem("aurelius_session_active", "true");
        localStorage.setItem("aurelius_user_role", result.role || "STUDENT");
      } catch {}

      const target = !result.hasProfile
        ? "/onboarding"
        : result.role === "TEACHER"
        ? "/teacher/dashboard"
        : "/student/dashboard";

      // Full top-level navigation ensures iOS Safari cookie transmission
      window.location.href = target;
    } catch (error) {
      if (!isUserCancelledAuthError(error)) {
        toast.error(firebaseAuthErrorMessage(error));
      }
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full active:scale-[0.98] transition-transform"
      disabled={loading}
      onClick={handleClick}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon className="size-4" />}
      Continue with Google
    </Button>
  );
}
