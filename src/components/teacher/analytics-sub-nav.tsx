import Link from "next/link";
import { Activity, Gem, Newspaper, ShieldCheck, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Phase 29 — quick links between the analytics sub-pages. Root-only pages are only rendered when the viewer is root. */
export function AnalyticsSubNav({ isRootTeacher }: { isRootTeacher: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href="/teacher/analytics/growth">
          <TrendingUp className="size-4" /> Growth Tracker
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href="/teacher/analytics/content">
          <Newspaper className="size-4" /> Content Analytics
        </Link>
      </Button>
      {isRootTeacher && (
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/teacher/analytics/platform">
              <Activity className="size-4" /> Platform Overview
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/teacher/analytics/teachers">
              <ShieldCheck className="size-4" /> Teacher Effectiveness
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/teacher/analytics/premium">
              <Gem className="size-4" /> Premium Analytics
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/teacher/analytics/health">
              <Activity className="size-4" /> Platform Health
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
