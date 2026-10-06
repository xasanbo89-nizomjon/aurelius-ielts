import type { ReactNode } from "react";

import { guardExamRoute } from "@/lib/route-guard";

// Deliberately outside the (dashboard) route group — the exam experience
// has no sidebar, no notifications, no user menu. Each page below still
// calls requireStudentProfile()/ownership checks itself.
export default async function ExamLayout({ children }: { children: ReactNode }) {
  // Phase L2 - a missing / not-yours attempt answers 404 here, before the page streams behind its loading.tsx (see src/lib/route-guard.ts).
  await guardExamRoute();
  return <div className="bg-background min-h-svh">{children}</div>;
}
