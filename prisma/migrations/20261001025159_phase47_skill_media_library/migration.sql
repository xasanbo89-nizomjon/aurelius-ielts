-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MediaUsageContext" ADD VALUE 'MOCK_TEST_COVER';
ALTER TYPE "MediaUsageContext" ADD VALUE 'WRITING_TASK_COVER';
ALTER TYPE "MediaUsageContext" ADD VALUE 'SPEAKING_TASK_COVER';
ALTER TYPE "MediaUsageContext" ADD VALUE 'SKILL_COVER';

-- AlterTable
ALTER TABLE "media_files" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "mock_tests" ADD COLUMN     "coverImagePath" TEXT;

-- AlterTable
ALTER TABLE "speaking_tasks" ADD COLUMN     "coverImagePath" TEXT;

-- AlterTable
ALTER TABLE "writing_tasks" ADD COLUMN     "coverImagePath" TEXT;

-- CreateTable
CREATE TABLE "skill_cover_images" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "skill" "SkillType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_cover_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_cover_images_teacherId_skill_key" ON "skill_cover_images"("teacherId", "skill");

-- CreateIndex
CREATE INDEX "media_files_ownerId_contentHash_idx" ON "media_files"("ownerId", "contentHash");

-- AddForeignKey
ALTER TABLE "skill_cover_images" ADD CONSTRAINT "skill_cover_images_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
