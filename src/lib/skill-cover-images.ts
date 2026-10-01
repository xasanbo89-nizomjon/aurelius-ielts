import "server-only";
import type { SkillType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { SKILL_COVER_SKILLS } from "@/lib/skill-cover-images-constants";

export type SkillCoverImageRow = {
  skill: SkillType;
  title: string;
  description: string | null;
  imagePath: string;
  updatedAt: Date;
};

/**
 * Phase 47 — Skill Media Library. Platform-wide banners for the 4 skill
 * landing pages (e.g. "Cambridge Reading Collection") — Root-Teacher-managed
 * since the Reading/Listening catalog these pages show pools every teacher's
 * published tests with no single "owning" teacher (see schema.prisma's
 * SkillCoverImage comment). A skill with no real row set is simply absent —
 * the caller renders no banner, never a placeholder.
 */
export async function getSkillCoverImages(): Promise<Record<SkillType, SkillCoverImageRow | null>> {
  const rows = await prisma.skillCoverImage.findMany();
  const bySkill = new Map(rows.map((row) => [row.skill, row]));
  const result = {} as Record<SkillType, SkillCoverImageRow | null>;
  for (const skill of SKILL_COVER_SKILLS) {
    const row = bySkill.get(skill);
    result[skill] = row
      ? { skill: row.skill, title: row.title, description: row.description, imagePath: row.imagePath, updatedAt: row.updatedAt }
      : null;
  }
  return result;
}

/** One real banner, for a single student-facing skill page — never fetches all 4 when only one is needed. */
export async function getSkillCoverImage(skill: SkillType): Promise<SkillCoverImageRow | null> {
  const row = await prisma.skillCoverImage.findUnique({ where: { skill } });
  if (!row) return null;
  return { skill: row.skill, title: row.title, description: row.description, imagePath: row.imagePath, updatedAt: row.updatedAt };
}

export async function upsertSkillCoverImage(
  updatedById: string,
  skill: SkillType,
  input: { title: string; description?: string; imagePath: string }
): Promise<void> {
  await prisma.skillCoverImage.upsert({
    where: { skill },
    create: { skill, title: input.title, description: input.description || null, imagePath: input.imagePath, updatedById },
    update: { title: input.title, description: input.description || null, imagePath: input.imagePath, updatedById },
  });
}

export async function deleteSkillCoverImage(skill: SkillType): Promise<void> {
  await prisma.skillCoverImage.deleteMany({ where: { skill } });
}
