"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic, ArrowRight } from "lucide-react";

import { getStudentDashboardData, type StudentDashboardData } from "@/actions/student-dashboard.actions";
import { ReadingStatsWidget } from "@/components/student/reading-stats-widget";
import { SpeakingPracticeWidget } from "@/components/student/speaking-practice-widget";
import { WhatsNewSection } from "@/components/dashboard/whats-new-section";
import { MobileDashboardWidgets } from "@/components/student/mobile-dashboard-widgets";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const INITIAL_DASHBOARD_DATA: StudentDashboardData = {
  firstName: "Xasan",
  whatsNew: [],
  streakCount: 0,
  success: {
    currentEstimate: null,
    targetBand: null,
    gap: null,
    testsCompleted: 0,
    weeklyProgress: { currentAvg: null, priorAvg: null, delta: null },
    monthlyProgress: { currentAvg: null, priorAvg: null, delta: null },
    trend: "NOT_ENOUGH_DATA",
    goalProgressPercent: null,
    estimatedCompletionDate: null,
  },
  subscription: {
    subscription: {
      id: "",
      studentId: "",
      status: "EXPIRED",
      startDate: new Date(0),
      endDate: new Date(0),
      planId: null,
      source: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    status: "EXPIRED",
    daysRemaining: null,
    hasAccess: false,
    isPremium: false,
  },
  weeklyActivity: [],
  readingStats: {
    articlesRead: 0,
    totalReadingTimeSeconds: 0,
    wordsSaved: 0,
    highlightsCreated: 0,
    readingStreak: 0,
  },
  speakingStats: {
    practiceCount: 0,
    averageBand: null,
    bestBand: null,
    weakestSkill: null,
    lastPracticeDate: null,
  },
  premium: {
    isPremium: false,
    planName: null,
    expiresAt: null,
    daysRemaining: null,
  },
  studyStreak: {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    streakFreezeUsedAt: null,
  },
};

export default function StudentDashboardPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [data, setData] = useState<StudentDashboardData>(INITIAL_DASHBOARD_DATA);
  const [customQuestion, setCustomQuestion] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    let active = true;
    getStudentDashboardData().then((result) => {
      if (active && result) {
        setData(result);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Blinking cursor simulation matching the mockup's input field
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 600);
    return () => clearInterval(interval);
  }, []);

  function handleSpeakingSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = customQuestion.trim();
    if (trimmed) {
      router.push(`/student/speaking-practice/record?custom=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/student/speaking-practice/record");
    }
  }

  // Real or mockup scores
  const readingBand = data.success.currentEstimate
    ? data.success.currentEstimate.toFixed(1)
    : "7.5";
  const writingFeedback = "B+";
  const speakingProgress = "60%";
  const articlesLevel = "Advanced";

  return (
    <div className="flex w-full flex-col gap-10 sm:gap-14 pt-4 sm:pt-8 pb-16">
      {/* ========================================================================= */}
      {/* 1000% EXACT REPLICA OF THE FUTURISTIC ANTI-GRAVITY UI SYSTEM              */}
      {/* ========================================================================= */}
      <div className="relative w-full max-w-7xl mx-auto flex flex-col gap-6 lg:gap-8">

        {/* TOP ROW: Tests (Left) | Welcome Banner (Center) | Writing (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 sm:gap-6 items-center">
          
          {/* 1. LEFT: "Tests" Card */}
          <div className="lg:col-span-3">
            <Link
              href="/student/tests"
              className={cn(
                "group relative block rounded-[28px] p-6 sm:p-7 backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden",
                isDark
                  ? "border border-slate-700/60 bg-slate-900/60 shadow-lg text-slate-100"
                  : "border border-slate-300/70 bg-[#f8fafc]/90 shadow-md text-slate-800"
              )}
            >
              {/* Top glass reflection */}
              <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="pointer-events-none absolute inset-x-8 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

              <h2
                className={cn(
                  "font-display text-2xl sm:text-3xl font-bold tracking-tight mb-1.5 transition-colors",
                  isDark
                    ? "text-blue-400"
                    : "text-blue-950 font-bold"
                )}
              >
                Tests
              </h2>
              <p
                className={cn(
                  "text-sm sm:text-base font-medium",
                  isDark
                    ? "text-slate-300"
                    : "text-slate-600"
                )}
              >
                Reading score: {readingBand}
              </p>
            </Link>
          </div>

          {/* 2. CENTER: Large Floating "Welcome back, Xasan" Panel */}
          <div className="md:col-span-2 lg:col-span-6">
            <div
              className={cn(
                "relative rounded-[32px] p-6 sm:p-9 text-center backdrop-blur-2xl transition-all duration-300 flex flex-col items-center justify-center overflow-hidden",
                isDark
                  ? "border border-slate-700/60 bg-slate-900/60 shadow-xl text-slate-100"
                  : "border border-slate-300/70 bg-[#f8fafc]/90 shadow-lg text-slate-800"
              )}
            >
              {/* Top and bottom subtle rims */}
              <div className="pointer-events-none absolute inset-x-12 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <div className="pointer-events-none absolute inset-x-12 bottom-0 h-[2.5px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

              {/* Title: Welcome back, Xasan */}
              <h1
                className={cn(
                  "font-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight mb-2 transition-colors leading-tight",
                  isDark
                    ? "text-blue-400"
                    : "text-blue-950"
                )}
              >
                Welcome back, {data.firstName}
              </h1>

              {/* Question: What would you like to study today? */}
              <p
                className={cn(
                  "text-base sm:text-lg lg:text-xl font-normal mb-5 sm:mb-6",
                  isDark
                    ? "text-slate-300"
                    : "text-slate-600"
                )}
              >
                What would you like to study today?
              </p>

              {/* Integrated Pill Capsule Button: Free Plan / Upgrade to Premium */}
              <Link
                href="/student/premium"
                className={cn(
                  "group relative inline-flex items-center gap-1.5 rounded-full px-6 sm:px-8 py-2 sm:py-2.5 text-xs sm:text-sm transition-all duration-300 cursor-pointer outline-none",
                  isDark
                    ? "border border-slate-700 bg-slate-800/80 backdrop-blur-md shadow-sm hover:border-blue-500"
                    : "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                )}
              >
                <span className={isDark ? "text-slate-300 font-medium" : "text-slate-600 font-medium"}>
                  {data.premium.isPremium ? "Premium Plan /" : "Free Plan /"}
                </span>
                <span className="text-blue-600 font-bold group-hover:text-blue-700 transition-colors">
                  {data.premium.isPremium ? "Manage Subscription" : "Upgrade to Premium"}
                </span>
              </Link>
            </div>
          </div>

          {/* 3. RIGHT: "Writing" Card */}
          <div className="lg:col-span-3">
            <Link
              href="/student/writing"
              className={cn(
                "group relative block rounded-[28px] p-6 sm:p-7 backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden",
                isDark
                  ? "border border-slate-700/60 bg-slate-900/60 shadow-lg text-slate-100"
                  : "border border-slate-300/70 bg-[#f8fafc]/90 shadow-md text-slate-800"
              )}
            >
              {/* Top glass reflection and bottom rim */}
              <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="pointer-events-none absolute inset-x-8 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

              <h2
                className={cn(
                  "font-display text-2xl sm:text-3xl font-bold tracking-tight mb-1.5 transition-colors",
                  isDark
                    ? "text-blue-400"
                    : "text-blue-950 font-bold"
                )}
              >
                Writing
              </h2>
              <p
                className={cn(
                  "text-sm sm:text-base font-medium",
                  isDark
                    ? "text-slate-300"
                    : "text-slate-600"
                )}
              >
                Feedback: {writingFeedback}
              </p>
            </Link>
          </div>

        </div>

        {/* BOTTOM ROW: Leveled Articles (Left) | Speaking with Custom Input (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-center">
          
          {/* 4. LOWER LEFT: "Leveled Articles" Card */}
          <div className="lg:col-span-5">
            <Link
              href="/student/articles"
              className={cn(
                "group relative block rounded-[28px] p-6 sm:p-7 backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden",
                isDark
                  ? "border border-slate-700/60 bg-slate-900/60 shadow-lg text-slate-100"
                  : "border border-slate-300/70 bg-[#f8fafc]/90 shadow-md text-slate-800"
              )}
            >
              {/* Top glass reflection and bottom rim */}
              <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="pointer-events-none absolute inset-x-8 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

              <h2
                className={cn(
                  "font-display text-2xl sm:text-3xl font-bold tracking-tight mb-1.5 transition-colors",
                  isDark
                    ? "text-blue-400"
                    : "text-blue-950 font-bold"
                )}
              >
                Leveled Articles
              </h2>
              <p
                className={cn(
                  "text-sm sm:text-base font-medium",
                  isDark
                    ? "text-slate-300"
                    : "text-slate-600"
                )}
              >
                Level: {articlesLevel}
              </p>
            </Link>
          </div>

          {/* 5. LOWER RIGHT: "Speaking" Wide Card with Integrated Input & Glowing Mic Button */}
          <div className="lg:col-span-7">
            <div
              className={cn(
                "relative rounded-[28px] p-6 sm:p-7 backdrop-blur-2xl transition-all duration-300 overflow-hidden",
                isDark
                  ? "border border-slate-700/60 bg-slate-900/60 shadow-lg text-slate-100"
                  : "border border-slate-300/70 bg-[#f8fafc]/90 shadow-md text-slate-800"
              )}
            >
              {/* Top glass reflection and bottom rim */}
              <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="pointer-events-none absolute inset-x-8 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

              {/* Title & Progress */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2
                    className={cn(
                      "font-display text-2xl sm:text-3xl font-bold tracking-tight mb-1 transition-colors",
                      isDark
                        ? "text-blue-400"
                        : "text-blue-950 font-bold"
                    )}
                  >
                    Speaking
                  </h2>
                  <p
                    className={cn(
                      "text-sm sm:text-base font-medium",
                      isDark
                        ? "text-slate-300"
                        : "text-slate-600"
                    )}
                  >
                    Progress: {speakingProgress}
                  </p>
                </div>

                <Link
                  href="/student/speaking-practice"
                  className={cn(
                    "hidden sm:flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200",
                    isDark
                      ? "border-blue-500/40 text-blue-400 hover:bg-blue-500/15"
                      : "border-blue-200 text-blue-700 hover:bg-blue-50"
                  )}
                >
                  <span>Practice Library</span>
                  <ArrowRight className="size-3" />
                </Link>
              </div>

              {/* Integrated Custom IELTS Speaking Question Input Field */}
              <form
                onSubmit={handleSpeakingSubmit}
                className={cn(
                  "relative flex items-center gap-3 rounded-2xl p-2 sm:p-2.5 backdrop-blur-md transition-all duration-300",
                  isDark
                    ? "border border-slate-700 bg-slate-950/50 shadow-inner"
                    : "border border-slate-300 bg-slate-100/90"
                )}
              >
                <div className="relative flex-1 px-3 py-1">
                  <input
                    type="text"
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="Enter Your Custom IELTS Speaking Question Here:"
                    className={cn(
                      "w-full bg-transparent text-sm sm:text-base font-normal outline-none transition-colors",
                      isDark
                        ? "text-slate-100 placeholder:text-slate-400"
                        : "text-slate-900 placeholder:text-slate-400"
                    )}
                  />
                  {/* Blinking cursor simulation if input is empty */}
                  {!customQuestion && (
                    <span
                      className={cn(
                        "pointer-events-none absolute top-1 right-4 text-blue-600 font-bold",
                        cursorVisible ? "opacity-100" : "opacity-0"
                      )}
                    >
                      |
                    </span>
                  )}
                </div>

                {/* Circular Microphone Button Surrounded by Concentric Particle Glow Ring */}
                <div className="relative shrink-0 flex items-center justify-center p-1">
                  <div className="absolute inset-0 -m-1.5 rounded-full border border-blue-400/30 animate-spin opacity-50" style={{ animationDuration: "12s" }}>
                    <span className="absolute -top-1 left-1/2 size-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_#60a5fa]" />
                    <span className="absolute -bottom-1 left-1/4 size-1 rounded-full bg-blue-300 shadow-[0_0_6px_#93c5fd]" />
                  </div>
                  <div className="absolute inset-0 -m-3 rounded-full border border-dashed border-blue-300/30 animate-spin opacity-40" style={{ animationDuration: "20s", animationDirection: "reverse" }} />
                  <div className="absolute inset-0 rounded-full bg-blue-400/15 blur-md animate-pulse" />

                  {/* Circular Blue Button */}
                  <button
                    type="submit"
                    title="Start Speaking Practice"
                    className={cn(
                      "relative flex size-12 sm:size-14 items-center justify-center rounded-full border-2 transition-all duration-300 outline-none cursor-pointer active:scale-95",
                      "border-blue-500 bg-blue-600 text-white shadow-md hover:bg-blue-700"
                    )}
                  >
                    <Mic className="size-6 sm:size-7 drop-shadow-sm text-white" strokeWidth={2.2} />
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECONDARY DASHBOARD DATA & WIDGETS (Preserved below the main showcase)     */}
      {/* ========================================================================= */}
      <div className="w-full max-w-7xl mx-auto space-y-8 pt-6 border-t border-slate-200">
        <MobileDashboardWidgets
          targetBand={data.success.targetBand}
          goalProgressPercent={data.success.goalProgressPercent}
          isPremium={data.subscription.isPremium}
          premiumDaysRemaining={data.subscription.isPremium ? data.subscription.daysRemaining : null}
          streakCount={data.streakCount}
          weeklyActivity={data.weeklyActivity}
        />
        <ReadingStatsWidget stats={data.readingStats} />
        <SpeakingPracticeWidget stats={data.speakingStats} />
        <WhatsNewSection items={data.whatsNew} />
      </div>
    </div>
  );
}
