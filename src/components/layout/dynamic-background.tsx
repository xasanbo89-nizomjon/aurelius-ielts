"use client";

import { useTheme } from "@/components/theme-provider";

export function DynamicBackground() {
  const { isDark } = useTheme();

  if (!isDark) {
    // Light Mode: Eye comfort, soothing soft pearl, light warm cream, and gentle slate-50/blue-50 ambient gradients (No harsh #FFFFFF)
    return (
      <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden" aria-hidden="true">
        {/* Soft, soothing pearl & light warm cream base gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#e8eef6] via-[#f1f4f9] to-[#e5ecf4]" />

        {/* Gentle morning sunlight ambiance - Soft warm cream glow */}
        <div className="absolute -top-[10%] right-[10%] size-[620px] rounded-full bg-amber-100/35 blur-[140px]" />

        {/* Soothing serene sky ambient layer - Soft mist blue */}
        <div className="absolute top-[6%] -left-[10%] size-[700px] rounded-full bg-sky-200/35 blur-[150px]" />

        {/* Soft pearl / slate drifting cloud formation */}
        <div className="cloud-drift absolute top-[30%] left-[12%] size-[680px] rounded-full bg-slate-200/40 blur-[140px]" />

        {/* Soft azure atmospheric depth */}
        <div className="cloud-drift absolute top-[36%] right-[8%] size-[640px] rounded-full bg-blue-100/45 blur-[150px]" />

        {/* Gentle horizon ambient glow */}
        <div className="absolute bottom-[4%] left-[18%] size-[760px] rounded-full bg-sky-100/50 blur-[160px]" />
        <div className="absolute -bottom-[8%] right-[12%] size-[620px] rounded-full bg-amber-50/50 blur-[140px]" />
      </div>
    );
  }

  // Dark Mode: Breathtaking 4K Solar System & Swirling Galaxy Nebula with Twinkling Stars
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none" aria-hidden="true">
      {/* 1. Base High-Resolution 4K Solar System & Galaxy Wallpaper */}
      <img
        src="/images/solar-system-galaxy-bg.jpg"
        alt="Solar System and Galaxy Background"
        className="absolute inset-0 size-full object-cover object-center scale-105 transition-transform duration-1000 ease-out"
      />

      {/* 2. Deep space subtle vignette to keep UI text perfectly readable while galaxy shines through */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#030509]/30 via-transparent to-[#020306]/55" />

      {/* 3. Celestial Solar System & Cosmic Elements */}
      {/* Subtle glowing planetary sphere (ringed gas giant) in space */}
      <div className="absolute top-[8%] right-[10%] opacity-70 pointer-events-none">
        <div className="relative size-24 sm:size-32 rounded-full bg-gradient-to-tr from-amber-700/60 via-amber-500/40 to-yellow-200/50 shadow-[0_0_40px_rgba(245,158,11,0.35)]">
          {/* Ring system */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-44 sm:w-56 h-10 sm:h-12 border-2 border-amber-300/40 rounded-full rotate-[-25deg] shadow-[0_0_15px_rgba(251,191,36,0.4)] pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 sm:w-48 h-8 sm:h-10 border border-amber-200/25 rounded-full rotate-[-25deg] pointer-events-none" />
        </div>
      </div>

      {/* Blue jewel planet (Earth / Neptune) in bottom-left distance */}
      <div className="absolute bottom-[14%] left-[6%] opacity-60 pointer-events-none">
        <div className="size-16 sm:size-20 rounded-full bg-gradient-to-tr from-indigo-900/70 via-blue-600/50 to-cyan-300/60 shadow-[0_0_30px_rgba(56,189,248,0.35)]" />
      </div>

      {/* 4. Twinkling celestial stars and sparkles field */}
      <div className="absolute inset-0">
        {/* Animated star sparkles positioned across space */}
        <span className="absolute top-[12%] left-[15%] size-1 rounded-full bg-white shadow-[0_0_8px_#fff] animate-ping" style={{ animationDuration: "3.2s" }} />
        <span className="absolute top-[28%] left-[8%] size-1.5 rounded-full bg-amber-200 shadow-[0_0_10px_#fde68a] animate-pulse" style={{ animationDuration: "2.4s" }} />
        <span className="absolute top-[45%] left-[22%] size-1 rounded-full bg-cyan-200 shadow-[0_0_8px_#a5f3fc] animate-ping" style={{ animationDuration: "4.1s" }} />
        <span className="absolute top-[75%] left-[12%] size-2 rounded-full bg-purple-200 shadow-[0_0_12px_#e9d5ff] animate-pulse" style={{ animationDuration: "3.5s" }} />

        <span className="absolute top-[18%] right-[24%] size-1 rounded-full bg-amber-100 shadow-[0_0_8px_#fef3c7] animate-pulse" style={{ animationDuration: "2.8s" }} />
        <span className="absolute top-[35%] right-[14%] size-1.5 rounded-full bg-white shadow-[0_0_10px_#fff] animate-ping" style={{ animationDuration: "3.6s" }} />
        <span className="absolute top-[62%] right-[18%] size-2 rounded-full bg-amber-300 shadow-[0_0_12px_#fcd34d] animate-pulse" style={{ animationDuration: "2.1s" }} />
        <span className="absolute top-[82%] right-[28%] size-1 rounded-full bg-cyan-100 shadow-[0_0_8px_#cffafe] animate-ping" style={{ animationDuration: "4.5s" }} />

        <span className="absolute top-[8%] left-[48%] size-1.5 rounded-full bg-white shadow-[0_0_10px_#fff] animate-pulse" style={{ animationDuration: "3.9s" }} />
        <span className="absolute top-[52%] left-[52%] size-1 rounded-full bg-fuchsia-200 shadow-[0_0_8px_#f5d0fe] animate-ping" style={{ animationDuration: "3.1s" }} />
        <span className="absolute top-[22%] left-[72%] size-1 rounded-full bg-white shadow-[0_0_6px_#fff] animate-pulse" style={{ animationDuration: "2.7s" }} />
        <span className="absolute top-[68%] left-[38%] size-1.5 rounded-full bg-amber-200 shadow-[0_0_8px_#fde68a] animate-ping" style={{ animationDuration: "4.3s" }} />
      </div>

      {/* 5. Cosmic ambient atmospheric depth glow */}
      <div className="absolute -top-[10%] left-[25%] size-[650px] rounded-full bg-purple-600/18 blur-[140px] mix-blend-screen" />
      <div className="absolute top-[35%] right-[15%] size-[600px] rounded-full bg-amber-500/18 blur-[130px] mix-blend-screen" />
      <div className="absolute bottom-[5%] left-[10%] size-[650px] rounded-full bg-indigo-600/18 blur-[150px] mix-blend-screen" />
    </div>
  );
}
