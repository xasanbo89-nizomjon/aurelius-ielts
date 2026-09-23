-- AlterTable
ALTER TABLE "teacher_profiles" ADD COLUMN     "isRootTeacher" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: grant root status to the existing bootstrap root teacher and
-- the newly-promoted second root teacher. Additive only — no rows created,
-- no rows deleted, no other column touched.
UPDATE "teacher_profiles" tp
SET "isRootTeacher" = true
FROM "users" u
WHERE u.id = tp."userId"
  AND u.email IN ('axiy3735@gmail.com', 'azizbektursunov8800@gmail.com');
