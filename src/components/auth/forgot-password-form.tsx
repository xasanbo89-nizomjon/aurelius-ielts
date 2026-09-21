"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { sendPasswordResetEmail } from "firebase/auth";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { getFirebaseAuth } from "@/lib/firebase/client";
import { firebaseAuthErrorMessage } from "@/lib/firebase/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});
type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordInput) {
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), values.email);
      setSent(true);
    } catch (error) {
      // Never reveal whether an account exists for this email — a
      // "user not found" response looks identical to a successful send.
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code === "auth/user-not-found") {
        setSent(true);
      } else {
        toast.error(firebaseAuthErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-5 text-center">
        <span className="bg-secondary text-accent mx-auto flex size-12 items-center justify-center rounded-2xl">
          <MailCheck className="size-6" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-medium tracking-tight">Check your email</h1>
          <p className="text-muted-foreground text-sm">
            If an account exists for that address, we&apos;ve sent a link to reset your password.
          </p>
        </div>
        <a href="/login" className="text-foreground text-sm font-medium underline-offset-4 hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-medium tracking-tight">Reset your password</h1>
        <p className="text-muted-foreground text-sm">We&apos;ll email you a link to get back into your account.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
          {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Send reset link
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        <a href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">
          Back to sign in
        </a>
      </p>
    </div>
  );
}
