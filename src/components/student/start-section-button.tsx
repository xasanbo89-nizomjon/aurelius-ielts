"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending} data-testid="start-section-button">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Starting…" : label}
    </Button>
  );
}

/**
 * The "Start Reading" / "Start Writing" button between Full Mock sections.
 * It disables itself the instant it is pressed so a double click can't send
 * the request twice (the server ignores a repeat anyway — this just keeps the
 * screen honest while it works).
 */
export function StartSectionButton({ action, label }: { action: (formData: FormData) => void | Promise<void>; label: string }) {
  return (
    <form action={action}>
      <SubmitButton label={label} />
    </form>
  );
}
