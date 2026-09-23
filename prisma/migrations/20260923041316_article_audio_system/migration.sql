-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "audioDuration" INTEGER;

-- AlterTable
ALTER TABLE "reading_progress" ADD COLUMN     "audioProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
