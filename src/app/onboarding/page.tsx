import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getFirebaseSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { OnboardingWelcome } from "@/components/auth/onboarding-welcome";

export const metadata: Metadata = { title: "Finish setting up" };

export default async function OnboardingPage() {
  const session = await getFirebaseSession();
  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({ where: { firebaseUid: session.uid }, select: { role: true } });
  if (user) {
    redirect(user.role === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard");
  }

  const displayName = typeof session.name === "string" ? session.name : null;

  return (
    <div className="bg-background flex min-h-svh items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <OnboardingWelcome name={displayName} />
      </div>
    </div>
  );
}
