import type { SkillCoverImageRow } from "@/lib/skill-cover-images";
import { FallbackImage } from "@/components/ui/fallback-image";

/**
 * Phase 47 — Skill Media Library's student-facing banner. Renders nothing
 * at all when no Root Teacher has set a real cover for this skill yet —
 * never a placeholder image or example title.
 */
export function SkillCoverBanner({ cover }: { cover: SkillCoverImageRow | null }) {
  if (!cover) return null;

  return (
    <div className="border-border/70 shadow-soft relative overflow-hidden rounded-2xl border">
      <div className="relative aspect-[21/7] w-full sm:aspect-[21/5]">
        <FallbackImage src={cover.imagePath} alt={cover.title} fill sizes="100vw" className="object-cover" unoptimized priority />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden="true" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <h2 className="font-display text-xl font-medium text-white sm:text-2xl">{cover.title}</h2>
        {cover.description && <p className="mt-1 max-w-xl text-sm text-white/85">{cover.description}</p>}
      </div>
    </div>
  );
}
