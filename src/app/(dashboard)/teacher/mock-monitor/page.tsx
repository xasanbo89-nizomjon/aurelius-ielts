import type { Metadata } from "next";

import { requireTeacherProfile } from "@/lib/session";
import { getMockMonitorSnapshot } from "@/lib/mock-monitor";
import { PageHeader } from "@/components/dashboard/page-header";
import { MockMonitor } from "@/components/teacher/mock-monitor";

export const metadata: Metadata = { title: "Live Monitor" };

export default async function TeacherMockMonitorPage({ searchParams }: { searchParams: Promise<{ mock?: string }> }) {
  const { profile } = await requireTeacherProfile();
  const { mock } = await searchParams;
  const mockId = mock?.trim() ? mock.trim().slice(0, 64) : null;

  const snapshot = await getMockMonitorSnapshot({ teacherId: profile.id, isRoot: profile.isRootTeacher }, { fullMockTestId: mockId });

  return (
    <>
      <PageHeader
        title="Live Monitor"
        description={
          profile.isRootTeacher
            ? "Every student sitting a Full Mock right now - section, progress, time left on the server's clock and when their work was last saved."
            : "Your students sitting a Full Mock right now - section, progress, time left on the server's clock and when their work was last saved."
        }
      />
      <MockMonitor initial={snapshot} initialMockId={mockId} />
    </>
  );
}
