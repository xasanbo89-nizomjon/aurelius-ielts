"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic, ArrowRight, Sparkles, Send } from "lucide-react";

export function SpeakingHubCard({
  title = "Speaking",
  description = "Practice your speaking skills for the IELTS exam.",
  href = "/student/speaking-practice",
}: {
  title?: string;
  description?: string;
  href?: string;
}) {
  const router = useRouter();
  const [customQuestion, setCustomQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = customQuestion.trim();
    setSubmitting(true);
    if (trimmed) {
      router.push(`/student/speaking-practice/record?custom=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/student/speaking-practice/record");
    }
  }

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl sm:rounded-3xl border border-amber-500/25 bg-[#121624]/80 p-6 sm:p-8 backdrop-blur-xl shadow-[0_12px_40px_-5px_rgba(0,0,0,0.8),0_0_20px_rgba(217,178,86,0.1)] transition-all duration-300 hover:border-amber-400/50 hover:shadow-[0_16px_50px_-5px_rgba(0,0,0,0.9),0_0_30px_rgba(217,178,86,0.2)]">
      {/* Soft gold ambient corner glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-amber-500/10 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />

      <div>
        {/* Top Icon & Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <span className="relative flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-500/25 via-amber-600/15 to-transparent text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.25)]">
            <Mic className="size-6 sm:size-7 text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" strokeWidth={1.75} />
          </span>
          <Link
            href={href}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-300/80 hover:text-amber-200 transition-colors"
          >
            <span>Open Practice</span>
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Title and Description */}
        <div className="space-y-1.5">
          <h3 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-amber-100">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-amber-200/70 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {/* Integrated Custom Question Input Field */}
      <div className="mt-6 pt-5 border-t border-amber-500/20">
        <label
          htmlFor="custom-speaking-prompt"
          className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-200/90"
        >
          <Sparkles className="size-3.5 text-amber-400" />
          <span>Enter Your Custom IELTS Speaking Question Here:</span>
        </label>

        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            id="custom-speaking-prompt"
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="e.g. Describe a challenge you overcame..."
            disabled={submitting}
            className="w-full rounded-xl border border-amber-500/30 bg-[#0a0d14]/90 py-2.5 pr-24 pl-3.5 text-xs sm:text-sm text-amber-100 placeholder:text-amber-200/30 backdrop-blur-md transition-all duration-200 outline-none focus:border-amber-400 focus:bg-[#0c0f18] focus:ring-2 focus:ring-amber-500/25"
          />

          <div className="absolute right-1.5 flex items-center gap-1">
            <button
              type="submit"
              disabled={submitting}
              title="Start Practice with this Question"
              className="group/btn flex items-center gap-1 rounded-lg border border-amber-400/40 bg-gradient-to-r from-amber-500/30 via-amber-400/25 to-amber-600/30 px-2.5 py-1.5 text-xs font-semibold text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.25)] transition-all duration-200 hover:border-amber-400/80 hover:from-amber-500/50 hover:to-amber-600/50 hover:text-white"
            >
              <Mic className="size-3.5 text-amber-300 group-hover/btn:scale-110 transition-transform" />
              <Send className="size-3 text-amber-300" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
