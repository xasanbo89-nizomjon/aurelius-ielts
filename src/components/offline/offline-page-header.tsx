import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BrandMark } from "@/components/layout/brand-mark";

/** Shared chrome for the /offline/* sub-pages (not the root SW fallback page, which stays standalone). */
export function OfflinePageHeader({ title }: { title: string }) {
  return (
    <>
      <header className="border-border/70 -mx-4 mb-6 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link href="/offline" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <BrandMark />
      </header>
      <h1 className="font-display -mt-2 mb-4 text-xl font-medium tracking-tight">{title}</h1>
    </>
  );
}
