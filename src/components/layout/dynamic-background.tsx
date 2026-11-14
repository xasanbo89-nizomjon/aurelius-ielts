"use client";

export function DynamicBackground() {
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
