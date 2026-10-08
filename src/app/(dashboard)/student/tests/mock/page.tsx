import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getStudentFullMockDashboard } from "@/lib/full-mock-dashboard";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FullMockExamCard, type FullMockCardStatus } from "@/components/student/full-mock-exam-card";
import { MockAccessCodeGate } from "@/components/student/mock-access-code-gate";
import type { FullMockCardData } from "@/lib/full-mock-dashboard";

export const metadata: Metadata = { title: "Mock Exams" };

function ExamGrid({ tests, status, emptyMessage }: { tests: FullMockCardData[]; status: FullMockCardStatus; emptyMessage: string }) {
  if (tests.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">{emptyMessage}</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {tests.map((test) => (
        <FullMockExamCard key={test.id} test={test} status={status} />
      ))}
    </div>
  );
}

export default async function MockExamCenterPage() {
  const { profile } = await requireStudentProfile();
  const dashboard = await getStudentFullMockDashboard(profile.id);

  const totalTests = dashboard.available.length + dashboard.inProgress.length + dashboard.completed.length + dashboard.premiumLocked.length;

  if (totalTests === 0) {
    return (
      <>
        <PageHeader title="Mock Exams" description="Sit a full Listening → Reading → Writing → Speaking exam under real timing." />
        <Card className="py-5">
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">Have an access code from your teacher?</p>
            <MockAccessCodeGate />
          </CardContent>
        </Card>
        <EmptyState
          icon={ClipboardCheck}
          title="No mock exams available yet"
          description="Your teacher hasn't published a full mock exam yet. Check back soon."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Mock Exams" description="Sit a full Listening → Reading → Writing → Speaking exam under real timing." />

      <Card className="py-5">
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Have an access code from your teacher? Enter it here to unlock your mock.</p>
          <MockAccessCodeGate />
        </CardContent>
      </Card>

      <Tabs defaultValue="available">
        <TabsList>
          <TabsTrigger value="available">Available ({dashboard.available.length})</TabsTrigger>
          <TabsTrigger value="inProgress">Upcoming ({dashboard.inProgress.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({dashboard.completed.length})</TabsTrigger>
          <TabsTrigger value="premium">Premium ({dashboard.premiumLocked.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="available" className="mt-4">
          <ExamGrid tests={dashboard.available} status="available" emptyMessage="No new mock exams to start right now — check Completed or Premium." />
        </TabsContent>
        <TabsContent value="inProgress" className="mt-4">
          <ExamGrid tests={dashboard.inProgress} status="inProgress" emptyMessage="Nothing in progress — start a mock exam from Available to see it here." />
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          <ExamGrid tests={dashboard.completed} status="completed" emptyMessage="You haven't completed a full mock exam yet." />
        </TabsContent>
        <TabsContent value="premium" className="mt-4">
          <ExamGrid tests={dashboard.premiumLocked} status="locked" emptyMessage="No premium-only mock exams right now." />
        </TabsContent>
      </Tabs>
    </>
  );
}
