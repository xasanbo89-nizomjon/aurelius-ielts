-- CreateEnum
CREATE TYPE "WritingTrainingType" AS ENUM ('ACADEMIC', 'GENERAL');

-- AlterEnum
ALTER TYPE "MediaUsageContext" ADD VALUE 'WRITING_TASK_VISUAL';

-- AlterTable
ALTER TABLE "writing_submissions" ADD COLUMN     "corrections" TEXT,
ADD COLUMN     "isDuplicate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "writing_tasks" ADD COLUMN     "imageMediaFileId" TEXT,
ADD COLUMN     "trainingType" "WritingTrainingType" NOT NULL DEFAULT 'ACADEMIC';

-- AddForeignKey
ALTER TABLE "writing_tasks" ADD CONSTRAINT "writing_tasks_imageMediaFileId_fkey" FOREIGN KEY ("imageMediaFileId") REFERENCES "media_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
