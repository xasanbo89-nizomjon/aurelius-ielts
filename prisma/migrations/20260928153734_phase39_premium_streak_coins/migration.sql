-- AlterEnum
ALTER TYPE "StudyActivityType" ADD VALUE 'SPEAKING';

-- AlterTable
ALTER TABLE "study_streaks" ADD COLUMN     "streakFreezeUsedAt" TIMESTAMP(3);
