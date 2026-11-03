"use client";

import { useTheme } from "@/components/theme-provider";

export function DynamicBackground() {
  const { isDark } = useTheme();

  if (!isDark) {
    // Light Mode: Remove the galaxy entirely.
    // Bright, clean, serene sky with soft, subtle white/blue clouds and a crystal-clear gentle daytime atmosphere.
    return (
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        {/* Serene daylight sky canvas */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#eaf2fd] via-[#f5f8ff] to-[#edf4fc]" />

        {/* Soft morning sunlight glow - Top Right */}
        <div className="absolute -top-[10%] right-[10%] size-[600px] rounded-full bg-amber-200/35 blur-[130px]" />

        {/* Azure sky ambient layer - Top Left */}
        <div className="absolute top-[5%] -left-[10%] size-[680px] rounded-full bg-sky-200/50 blur-[140px]" />

        {/* Subtle white/blue cloud formation - Center Left */}
        <div className="cloud-drift absolute top-[30%] left-[15%] size-[700px] rounded-full bg-white/80 blur-[130px]" />

        {/* Soft crystalline blue cloud ambient - Center Right */}
        <div className="cloud-drift absolute top-[35%] right-[10%] size-[640px] rounded-full bg-blue-100/60 blur-[140px]" />

        {/* Serene horizon glow - Lower Screen */}
        <div className="absolute bottom-[5%] left-[20%] size-[800px] rounded-full bg-sky-100/70 blur-[150px]" />
        <div className="absolute -bottom-[10%] right-[15%] size-[600px] rounded-full bg-white/90 blur-[130px]" />
      </div>
    );
  }

  // Dark Mode: Immersive deep-space galaxy with glowing nebula ambient layers
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Base deep cosmic space canvas */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#07090e] via-[#090c14] to-[#05070b]" />

      {/* 1. Behind Top Navbar: Vibrant Violet & Indigo Aurora */}
      <div className="absolute -top-[12%] left-[18%] size-[680px] rounded-full bg-gradient-to-r from-purple-600/35 via-violet-600/30 to-blue-600/35 blur-[130px]" />
      <div className="absolute -top-[10%] right-[8%] size-[540px] rounded-full bg-indigo-500/25 blur-[120px]" />

      {/* 2. Behind Welcome Panel & Free Plan Bar: Glowing Purple & Warm Gold Nebula */}
      <div className="absolute top-[16%] left-[22%] size-[620px] rounded-full bg-purple-600/30 blur-[130px]" />
      <div className="absolute top-[20%] right-[18%] size-[520px] rounded-full bg-amber-500/25 blur-[120px]" />

      {/* 3. Behind 2x2 Feature Cards Grid */}
      {/* Top-Left (Tests Card): Vivid Blue & Indigo Glow */}
      <div className="absolute top-[40%] left-[4%] size-[560px] rounded-full bg-blue-600/35 blur-[130px]" />

      {/* Top-Right (Leveled Articles Card): Radiant Cosmic Purple Glow */}
      <div className="absolute top-[38%] right-[4%] size-[580px] rounded-full bg-violet-600/35 blur-[130px]" />

      {/* Bottom-Left (Writing Card): Luminous Deep Indigo/Cyan Nebula */}
      <div className="absolute top-[60%] left-[8%] size-[540px] rounded-full bg-cyan-600/25 blur-[140px]" />

      {/* Bottom-Right (Speaking Card): Warm Golden Cosmic Nebula */}
      <div className="absolute top-[58%] right-[8%] size-[560px] rounded-full bg-amber-500/30 blur-[130px]" />

      {/* 4. Lower Section / Widgets: Deep Purple & Stardust Swirl */}
      <div className="absolute bottom-[3%] left-[22%] size-[720px] rounded-full bg-purple-700/25 blur-[150px]" />
      <div className="absolute -bottom-[8%] right-[15%] size-[600px] rounded-full bg-blue-700/20 blur-[140px]" />
    </div>
  );
}
