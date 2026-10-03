import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/teacher/results", label: "All results", key: "results" },
  { href: "/teacher/results/students", label: "Student summary", key: "students" },
] as const;

/** The two views of the results area: every attempt, or one performance row per student. */
export function ResultsSubNav({ active }: { active: "results" | "students" }) {
  return (
    <nav aria-label="Results sections" className="border-border/70 flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
            active === tab.key ? "border-accent text-foreground" : "text-muted-foreground hover:text-foreground border-transparent"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
