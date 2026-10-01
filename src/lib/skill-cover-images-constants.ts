// Phase 47 — plain constant shared by both server-only lib code
// (skill-cover-images.ts) and client components (skill-cover-images-manager.tsx).
// Deliberately has no "server-only" import and no DB access, same convention
// as full-mock-constants.ts.
import type { SkillType } from "@prisma/client";

export const SKILL_COVER_SKILLS: SkillType[] = ["READING", "LISTENING", "WRITING", "SPEAKING"];
