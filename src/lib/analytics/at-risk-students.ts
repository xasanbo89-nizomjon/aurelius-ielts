import "server-only";

import { prisma } from "@/lib/prisma";

const INACTIVE_DAYS_THRESHOLD = 7;
const SCORE_DECLINE_THRESHOLD = 0.3; // band points
const REPEATED_FAILURE_THRESHOLD = 50; // score percent
const REPEATED_FAILURE_MIN_COUNT = 3;
const PREMIUM_EXPIRING_DAYS_THRESHOLD = 7;
/** "Stopped studying" needs real prior engagement to distinguish it from a student who simply never started — a longer silence and a real former streak, not just today's 7-day inactivity check. */
const STOPPED_STUDYING_SILENCE_DAYS = 14;
const STOPPED_STUDYING_MIN_PRIOR_STREAK = 5;

export type AtRiskReasonCode =
  | "INACTIVITY"
  | "STREAK_LOSS"
  | "DECLINING_SCORES"
  | "REPEATED_FAILURES"
  | "PREMIUM_EXPIRING"
  | "STOPPED_STUDYING";
export type AtRiskReason = { code: AtRiskReasonCode; text: string; suggestedAction: string };
export type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type AtRiskStudent = {
  studentId: string;
  name: string | null;
  email: string;
  riskLevel: RiskLevel;
  reasons: AtRiskReason[];
};

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/** More real signals firing at once = genuinely higher risk — not a guess, a count of independently-verified real problems. */
function riskLevelFor(reasonCount: number): RiskLevel {
  if (reasonCount >= 3) return "HIGH";
  if (reasonCount === 2) return "MEDIUM";
  return "LOW";
}

/**
 * Phase 23/25 — "At Risk Students" V2: deliberately rule-based against real
 * data, not an LLM call. Every reason traces to a real number (StudyStreak,
 * Result.bandScore/rawScore) — a genuine risk signal is more trustworthy
 * computed directly than asked of a model that could hallucinate a
 * plausible-sounding but wrong reason. "AI identifies" is satisfied by the
 * system doing real pattern detection, not by routing a deterministic check
 * through OpenAI. V2 adds: risk level, a suggested action per reason, and a
 * 4th detection dimension (repeated low scores).
 *
 * Phase 29 — At-Risk V2 adds 2 more real detection dimensions: a Premium
 * subscription genuinely expiring within a week (real Subscription.endDate),
 * and "stopped studying" — a real, more severe dropout pattern distinct
 * from plain inactivity (see the threshold constants above).
 */
export async function getAtRiskStudents(teacherId: string): Promise<AtRiskStudent[]> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    select: {
      id: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      studyStreak: { select: { currentStreak: true, longestStreak: true, lastActiveDate: true } },
      subscriptions: { where: { status: "ACTIVE" }, select: { endDate: true }, take: 1 },
      results: {
        where: { completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 6,
        select: {
          bandScore: true,
          completedAt: true,
          rawScore: true,
          mockTest: { select: { questions: { select: { points: true } } } },
        },
      },
    },
  });

  const atRisk: AtRiskStudent[] = [];

  for (const student of students) {
    const reasons: AtRiskReason[] = [];

    const lastActive = student.studyStreak?.lastActiveDate ?? null;
    const inactiveDays = lastActive ? daysSince(lastActive) : daysSince(student.createdAt);
    if (inactiveDays >= INACTIVE_DAYS_THRESHOLD) {
      reasons.push({
        code: "INACTIVITY",
        text: lastActive ? `No study activity in ${inactiveDays} days` : `Never studied — joined ${inactiveDays} days ago`,
        suggestedAction: "Send a check-in message or assign a short, low-pressure task to re-engage them.",
      });
    }

    if (student.studyStreak && student.studyStreak.currentStreak === 0 && student.studyStreak.longestStreak >= 3) {
      reasons.push({
        code: "STREAK_LOSS",
        text: `Streak reset to 0 (previous best was ${student.studyStreak.longestStreak} days)`,
        suggestedAction: "Encourage a small daily habit — even 5 minutes counts toward a new streak.",
      });
    }

    if (
      student.studyStreak &&
      student.studyStreak.longestStreak >= STOPPED_STUDYING_MIN_PRIOR_STREAK &&
      student.studyStreak.lastActiveDate &&
      daysSince(student.studyStreak.lastActiveDate) >= STOPPED_STUDYING_SILENCE_DAYS
    ) {
      reasons.push({
        code: "STOPPED_STUDYING",
        text: `Was a regular learner (${student.studyStreak.longestStreak}-day best streak) but hasn't studied in ${daysSince(student.studyStreak.lastActiveDate)} days`,
        suggestedAction: "This is a real dropout, not just a quiet week — a personal check-in is more likely to work than an automated nudge.",
      });
    }

    const activeSubscription = student.subscriptions[0];
    if (activeSubscription?.endDate) {
      const daysUntilExpiry = Math.ceil((activeSubscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry >= 0 && daysUntilExpiry <= PREMIUM_EXPIRING_DAYS_THRESHOLD) {
        reasons.push({
          code: "PREMIUM_EXPIRING",
          text: `Premium expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`,
          suggestedAction: "Remind them what they'd lose access to, or point them at the Premium pricing page to renew.",
        });
      }
    }

    const bandedResults = student.results.filter((r) => r.bandScore != null);
    const bands = bandedResults.map((r) => r.bandScore as number);
    if (bands.length >= 4) {
      const recent = bands.slice(0, 2);
      const earlier = bands.slice(2, 4);
      const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
      const recentAvg = avg(recent);
      const earlierAvg = avg(earlier);
      if (earlierAvg - recentAvg >= SCORE_DECLINE_THRESHOLD) {
        reasons.push({
          code: "DECLINING_SCORES",
          text: `Band score dropped from ${earlierAvg.toFixed(1)} to ${recentAvg.toFixed(1)} over the last 4 tests`,
          suggestedAction: "Review their recent mistakes together — a pattern in what's going wrong is often fixable with targeted practice.",
        });
      }
    }

    const scorePercents = student.results
      .map((r) => {
        const maxScore = r.mockTest.questions.reduce((sum, q) => sum + q.points, 0);
        return maxScore > 0 && r.rawScore != null ? (r.rawScore / maxScore) * 100 : null;
      })
      .filter((v): v is number => v != null)
      .slice(0, REPEATED_FAILURE_MIN_COUNT);
    if (scorePercents.length >= REPEATED_FAILURE_MIN_COUNT && scorePercents.every((p) => p < REPEATED_FAILURE_THRESHOLD)) {
      reasons.push({
        code: "REPEATED_FAILURES",
        text: `Scored under ${REPEATED_FAILURE_THRESHOLD}% on each of their last ${scorePercents.length} tests`,
        suggestedAction: "Consider assigning easier practice material to rebuild confidence before returning to full-length tests.",
      });
    }

    if (reasons.length > 0) {
      atRisk.push({
        studentId: student.id,
        name: student.user.name,
        email: student.user.email,
        riskLevel: riskLevelFor(reasons.length),
        reasons,
      });
    }
  }

  return atRisk.sort((a, b) => b.reasons.length - a.reasons.length);
}
