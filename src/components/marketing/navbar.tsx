import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";

export function MarketingNavbar() {
  return (
    <header className="border-border/70 bg-background/85 sticky top-0 z-30 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between px-6">
        <BrandMark />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
