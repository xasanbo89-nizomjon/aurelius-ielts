import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";

import { scopeFor } from "@/lib/exam/test-access";
import { requireTeacherProfile } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listMockAccessCodesForFullMockTest } from "@/lib/mock-access-codes";
import { listStudentsForTeacher } from "@/lib/teacher-students";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { MockAccessCodesManager } from "@/components/teacher/mock-access-codes-manager";

export const metadata: Metadata = { title: "Mock Access Codes" };

export default async function MockAccessCodesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireTeacherProfile();

  const test = await prisma.fullMockTest.findFirst({ where: { id, ...scopeFor(profile) }, select: { id: true, title: true } });
  if (!test) notFound();

  const [codes, students] = await Promise.all([
    listMockAccessCodesForFullMockTest(id, profile.id),
    listStudentsForTeacher(profile.id),
  ]);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/teacher/tests/full-mock/${id}`}>
          <ArrowLeft className="size-4" /> Back to builder
        </Link>
      </Button>

      <PageHeader
        title={test.title}
        description="Students must enter a valid access code before they can start this mock — generate one per student, or a bulk batch for the whole class."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/teacher/mock-results">
              <Trophy className="size-4" /> Mock Results
            </Link>
          </Button>
        }
      />

      <MockAccessCodesManager
        fullMockTestId={id}
        students={students}
        codes={codes.map((c) => ({
          id: c.id,
          code: c.code,
          isActive: c.isActive,
          expiresAt: c.expiresAt,
          createdAt: c.createdAt,
          assignedStudentName: c.assignedStudent ? c.assignedStudent.user.name ?? c.assignedStudent.user.email : null,
          redeemedByStudentName: c.redeemedByStudent ? c.redeemedByStudent.user.name ?? c.redeemedByStudent.user.email : null,
          redeemedAt: c.redeemedAt,
          maxRedemptions: c.maxRedemptions,
          redemptionCount: c.redemptionCount,
        }))}
      />
    </>
  );
}
