-- CreateEnum
CREATE TYPE "SectionEndReason" AS ENUM ('SUBMITTED', 'TIME_EXPIRED', 'TEACHER_ENDED');

-- AlterTable
ALTER TABLE "passages" ADD COLUMN     "audioDurationSeconds" INTEGER;

-- AlterTable
ALTER TABLE "results" ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "endReason" "SectionEndReason";

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "full_mock_tests" ADD COLUMN     "transitionLimitMinutes" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "full_mock_attempts" ADD COLUMN     "writingEndReason" "SectionEndReason",
ADD COLUMN     "writingEndedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "writing_late_texts" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "clientSavedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_late_texts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "writing_late_texts_submissionId_idx" ON "writing_late_texts"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "writing_late_texts_submissionId_contentHash_key" ON "writing_late_texts"("submissionId", "contentHash");

-- CreateIndex
CREATE INDEX "results_completedAt_deadlineAt_idx" ON "results"("completedAt", "deadlineAt");

-- CreateIndex
CREATE INDEX "full_mock_attempts_status_idx" ON "full_mock_attempts"("status");

-- AddForeignKey
ALTER TABLE "writing_late_texts" ADD CONSTRAINT "writing_late_texts_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "writing_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

