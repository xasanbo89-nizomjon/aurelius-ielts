import type { Metadata } from "next";
import { Award, Clock, Coins, Flame, Gauge, Gem, Target, Trophy } from "lucide-react";

import { requireStudentProfile } from "@/lib/session";
import { getStudentProfileDetails } from "@/lib/student-profile";
import { getWalletSummary } from "@/lib/coins";
import { getStreakBreakdown } from "@/lib/streaks";
import { getAchievementsForStudent, syncAchievements } from "@/lib/achievements";
import { getStudyTimeSummary } from "@/lib/study-activity";
import { getSubscriptionSummary } from "@/lib/subscription";
import { getStudentVocabularyStats } from "@/lib/vocabulary";
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_VARIANTS } from "@/lib/labels";
import { formatDuration } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ProfilePhotoUploader } from "@/components/student/profile-photo-uploader";
import { ProfileGoalsForm } from "@/components/student/profile-goals-form";
import { RedeemPremiumButton } from "@/components/student/redeem-premium-button";
import { VocabularyStatsCards } from "@/components/analytics/vocabulary-stats-cards";

export const metadata: Metadata = { title: "My Profile" };

export default async function StudentProfilePage() {
  const { user, profile } = await requireStudentProfile();

  // Lazy safety-net: real achievement conditions get re-checked here too, not just from the heartbeat/exam-completion path.
  await syncAchievements(profile.id);

  const [details, wallet, streak, achievements, studyTime, subscription, vocabularyStats] = await Promise.all([
    getStudentProfileDetails(user.id, profile.id),
    getWalletSummary(profile.id),
    getStreakBreakdown(profile.id),
    getAchievementsForStudent(profile.id),
    getStudyTimeSummary(profile.id),
    getSubscriptionSummary(profile.id),
    getStudentVocabularyStats(profile.id),
  ]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <>
      <PageHeader title="My Profile" description="Your goals, study activity, and rewards." />

      <Card>
        <CardContent>
          <ProfilePhotoUploader name={details.name} email={details.email} image={details.image} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="text-accent size-4.5" aria-hidden="true" /> IELTS Goal Tracker
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs font-medium">Current Estimated Band</p>
              <p className="font-display text-2xl font-medium tracking-tight">
                {details.currentEstimatedBand != null ? details.currentEstimatedBand.toFixed(1) : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">Target Band</p>
              <p className="font-display text-2xl font-medium tracking-tight">
                {details.targetBandScore != null ? details.targetBandScore.toFixed(1) : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">Progress</p>
              <p className="font-display text-2xl font-medium tracking-tight">
                {details.goalProgressPercent != null ? `${details.goalProgressPercent}%` : "—"}
              </p>
            </div>
          </div>
          {details.goalProgressPercent != null && <Progress value={details.goalProgressPercent} className="h-1.5" />}
          {(details.countryGoal || details.universityGoal || details.personalGoal) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {details.countryGoal && <Badge variant="outline">🌍 {details.countryGoal}</Badge>}
              {details.universityGoal && <Badge variant="outline">🎓 {details.universityGoal}</Badge>}
              {details.personalGoal && <Badge variant="outline">🎯 {details.personalGoal}</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileGoalsForm
            initialName={details.name}
            initialCountryGoal={details.countryGoal}
            initialUniversityGoal={details.universityGoal}
            initialPersonalGoal={details.personalGoal}
            initialTargetBand={details.targetBandScore}
          />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Study Time</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Today" value={formatDuration(studyTime.todaySeconds)} icon={Clock} />
          <StatCard label="This Week" value={formatDuration(studyTime.weekSeconds)} icon={Clock} />
          <StatCard label="This Month" value={formatDuration(studyTime.monthSeconds)} icon={Clock} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Vocabulary</h2>
        <VocabularyStatsCards stats={vocabularyStats} />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Coin Wallet</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Coins" value={String(wallet.balance)} icon={Coins} />
          <StatCard label="Today's Coins" value={`+${wallet.todayCoins}`} icon={Gauge} />
          <StatCard label="Lifetime Coins" value={String(wallet.lifetimeEarned)} icon={Trophy} />
        </div>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Redeem Premium</p>
              <p className="text-muted-foreground text-xs">1000 coins = 30 days of Premium access.</p>
            </div>
            <RedeemPremiumButton balance={wallet.balance} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-medium tracking-tight">Streak &amp; Premium Status</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Current Streak"
            value={streak.currentStreak > 0 ? `${streak.currentStreak} ${"🔥".repeat(Math.min(streak.currentStreak, 5))}` : "0"}
            icon={Flame}
            caption={`Longest: ${streak.longestStreak} day${streak.longestStreak === 1 ? "" : "s"}`}
          />
          <StatCard
            label="Weekly Streak"
            value={String(streak.weeklyStreak)}
            icon={Flame}
            caption={streak.weeklyStreak > 0 ? `${streak.weeklyStreak} week${streak.weeklyStreak === 1 ? "" : "s"} in a row` : "Study this week to start one"}
          />
          <StatCard
            label="Monthly Streak"
            value={String(streak.monthlyStreak)}
            icon={Flame}
            caption={streak.monthlyStreak > 0 ? `${streak.monthlyStreak} month${streak.monthlyStreak === 1 ? "" : "s"} in a row` : "Study this month to start one"}
          />
          <Card className="gap-0 py-5">
            <CardContent className="flex items-center justify-between gap-4">
              <div>
                <p className="text-muted-foreground text-sm font-medium">Premium Status</p>
                <Badge variant={SUBSCRIPTION_STATUS_VARIANTS[subscription.status]} className="mt-1.5">
                  {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                </Badge>
              </div>
              <span className="bg-secondary text-accent flex size-10 shrink-0 items-center justify-center rounded-xl">
                <Gem className="size-5" strokeWidth={1.75} />
              </span>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-medium tracking-tight">Achievements</h2>
          <span className="text-muted-foreground text-xs">
            {unlockedCount} / {achievements.length} unlocked
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((achievement) => (
            <Card key={achievement.code} className={achievement.unlocked ? undefined : "opacity-60"}>
              <CardContent className="flex items-start gap-3">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                    achievement.unlocked ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <Award className="size-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{achievement.title}</p>
                  <p className="text-muted-foreground text-xs">{achievement.description}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant={achievement.unlocked ? "success" : "outline"}>+{achievement.coinReward} coins</Badge>
                    {achievement.unlocked && achievement.unlockedAt && (
                      <span className="text-muted-foreground text-[11px]">{achievement.unlockedAt.toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
