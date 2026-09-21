import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
        <GraduationCap className="size-5" strokeWidth={1.75} />
      </span>
      <span className="font-display text-lg leading-none font-medium tracking-tight">
        Aurelius <span className="text-accent">IELTS</span>
      </span>
    </Link>
  );
}
