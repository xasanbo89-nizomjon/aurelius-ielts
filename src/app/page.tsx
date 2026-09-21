import { redirect } from "next/navigation";

import { getFirebaseSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getLatestPublishedUpdates } from "@/lib/updates";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingFeatures } from "@/components/marketing/features";
import { WhatsNew } from "@/components/marketing/whats-new";
import { MarketingFooter } from "@/components/marketing/footer";

export default async function HomePage() {
  const session = await getFirebaseSession();

  if (session) {
    const user = await prisma.user.findUnique({ where: { firebaseUid: session.uid }, select: { role: true } });
    redirect(user ? (user.role === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard") : "/onboarding");
  }

  const updates = await getLatestPublishedUpdates();

  return (
    <div className="flex min-h-svh flex-col">
      <MarketingNavbar />
      <main className="flex-1">
        <MarketingHero />
        <WhatsNew updates={updates} />
        <MarketingFeatures />
      </main>
      <MarketingFooter />
    </div>
  );
}
