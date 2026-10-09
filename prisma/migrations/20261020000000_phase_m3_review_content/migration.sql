-- CreateEnum
CREATE TYPE "ReviewJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "ExplanationStatus" ADD VALUE 'AUTO';

-- AlterTable
ALTER TABLE "explanation_generation_logs" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "review_content_jobs" (
    "id" TEXT NOT NULL,
    "mockTestId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "ReviewJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "doneQuestions" INTEGER NOT NULL DEFAULT 0,
    "failedQuestions" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_content_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_content_jobs_mockTestId_key" ON "review_content_jobs"("mockTestId");

-- CreateIndex
CREATE INDEX "review_content_jobs_status_updatedAt_idx" ON "review_content_jobs"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "review_content_jobs" ADD CONSTRAINT "review_content_jobs_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

