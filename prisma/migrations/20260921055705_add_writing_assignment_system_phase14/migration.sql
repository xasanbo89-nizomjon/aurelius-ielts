/*
  Warnings:

  - You are about to drop the column `isPublished` on the `writing_tasks` table.
    Its real data is preserved first: every row where "isPublished" = true is
    backfilled into the new "status" column as 'PUBLISHED' before the column
    is dropped, so no published-task state is lost.

*/
-- CreateEnum
CREATE TYPE "WritingTaskStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable: add the new column first (defaults every existing row to DRAFT)
ALTER TABLE "writing_tasks"
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "status" "WritingTaskStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "targetBand" DOUBLE PRECISION;

-- Backfill: carry over the real isPublished state before it's dropped
UPDATE "writing_tasks" SET "status" = 'PUBLISHED' WHERE "isPublished" = true;

-- DropIndex
DROP INDEX "writing_tasks_createdById_isPublished_idx";

-- AlterTable: now safe to drop, its data has been migrated into "status"
ALTER TABLE "writing_tasks" DROP COLUMN "isPublished";

-- CreateIndex
CREATE INDEX "writing_tasks_createdById_status_idx" ON "writing_tasks"("createdById", "status");

-- CreateTable
CREATE TABLE "writing_practice" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weaknessArea" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "basedOnSubmissionCount" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_practice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "writing_practice_studentId_key" ON "writing_practice"("studentId");

-- AddForeignKey
ALTER TABLE "writing_practice" ADD CONSTRAINT "writing_practice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
