"use client";

export function DynamicBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden transform-gpu" aria-hidden="true">
      {/* Soft, soothing pearl & light warm cream base gradient (GPU-free, lightning fast) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#e8eef6] via-[#f1f4f9] to-[#e5ecf4]" />

      {/* Gentle ambient glow - lightweight on mobile, rich on desktop */}
      <div className="absolute -top-[10%] right-[5%] size-[300px] sm:size-[620px] rounded-full bg-blue-100/40 blur-[70px] sm:blur-[140px]" />
      <div className="absolute top-[6%] -left-[10%] size-[340px] sm:size-[700px] rounded-full bg-sky-200/35 blur-[80px] sm:blur-[150px]" />

      {/* Heavy animated cloud-drift layers: preserved for tablet/desktop to save mobile GPU from frame-drops */}
      <div className="hidden sm:block cloud-drift absolute top-[30%] left-[12%] size-[680px] rounded-full bg-slate-200/40 blur-[140px]" />
      <div className="hidden sm:block cloud-drift absolute top-[36%] right-[8%] size-[640px] rounded-full bg-blue-100/45 blur-[150px]" />

      {/* Gentle horizon ambient glow */}
      <div className="hidden sm:block absolute bottom-[4%] left-[18%] size-[760px] rounded-full bg-sky-100/50 blur-[160px]" />
      <div className="absolute -bottom-[8%] right-[12%] size-[300px] sm:size-[620px] rounded-full bg-slate-100/50 blur-[70px] sm:blur-[140px]" />
    </div>
  );
}
