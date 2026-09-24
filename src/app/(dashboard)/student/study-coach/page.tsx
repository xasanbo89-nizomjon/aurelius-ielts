import type { Metadata } from "next";
import { ClipboardCheck, Gauge } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { getPerformanceOverview, getProfileInsights, getSkillPerformance, getStrengths, getWeaknesses } from "@/lib/analytics/student-insights";
import { getLatestStudyPlan } from "@/lib/ai/study-coach";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { InsightList } from "@/components/analytics/insight-list";
import { TargetBandCard } from "@/components/student/target-band-card";
import { StudyPlanView } from "@/components/student/study-plan-view";
import { PremiumLockScreen } from "@/components/dashboard/premium-lock-screen";

export const metadata: Metadata = { title: "Study Coach" };

export default async function StudyCoachPage() {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    return <PremiumLockScreen feature="Study Coach" />;
  }

  const [overview, skills, weaknesses, strengths, plan] = await Promise.all([
    getPerformanceOverview(profile.id),
    getSkillPerformance(profile.id),
    getWeaknesses(profile.id),
    getStrengths(profile.id),
    getLatestStudyPlan(profile.id),
  ]);
  const insights = getProfileInsights(overview, skills);

  return (
    <>
      <PageHeader
        title="Study Coach"
        description="A personalized plan built from your real performance — never guessed."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Current Estimated Level"
          value={insights.estimatedBand != null ? insights.estimatedBand.toFixed(1) : "—"}
          caption={insights.cefrLabel ?? "Not enough data yet"}
          icon={Gauge}
        />
        <TargetBandCard targetBand={profile.targetBandScore} />
        <StatCard label="Tests Completed" value={String(overview.testsCompleted)} icon={ClipboardCheck} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <InsightList
          title="Biggest Weaknesses"
          description="What your plan below focuses on first."
          insights={weaknesses}
          tone="weak"
        />
        <InsightList
          title="Biggest Strengths"
          description="Kept warm with lighter maintenance work."
          insights={strengths}
          tone="strong"
        />
      </div>

      <StudyPlanView initialPlan={plan} hasEnoughData={overview.testsCompleted > 0} />
    </>
  );
}
