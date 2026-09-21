"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
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

  async function handleClick() {
    setLoading(true);
    try {
      const credential = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
      const idToken = await credential.user.getIdToken();

      const result = await establishSessionAction(idToken);
      if (!result.success) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      if (!result.hasProfile) {
        router.push("/onboarding");
        return;
      }

      router.push(result.role === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard");
      router.refresh();
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
      className="w-full"
      disabled={loading}
      onClick={handleClick}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon className="size-4" />}
      Continue with Google
    </Button>
  );
}
