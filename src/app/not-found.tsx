import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="bg-secondary text-accent flex size-14 items-center justify-center rounded-2xl">
        <Compass className="size-7" strokeWidth={1.5} />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h1 className="font-display text-xl font-medium">Page not found</h1>
        <p className="text-muted-foreground text-sm">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
