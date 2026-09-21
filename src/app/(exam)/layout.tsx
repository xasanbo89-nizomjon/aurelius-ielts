import type { ReactNode } from "react";

// Deliberately outside the (dashboard) route group — the exam experience
// has no sidebar, no notifications, no user menu. Each page below still
// calls requireStudentProfile()/ownership checks itself.
export default function ExamLayout({ children }: { children: ReactNode }) {
  return <div className="bg-background min-h-svh">{children}</div>;
}
