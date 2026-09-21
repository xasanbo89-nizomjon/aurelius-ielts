"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function GlobalPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-2xl">
        <AlertTriangle className="size-7" strokeWidth={1.5} />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h1 className="font-display text-xl font-medium">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          An unexpected error occurred. Please try again, or head back to the homepage.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
