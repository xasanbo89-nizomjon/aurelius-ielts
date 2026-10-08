-- CreateEnum
CREATE TYPE "WritingAssessmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "mock_tests" ADD COLUMN     "showResultsToStudent" BOOLEAN;

-- AlterTable
ALTER TABLE "writing_tasks" ADD COLUMN     "showResultsToStudent" BOOLEAN;

-- CreateTable
CREATE TABLE "writing_assessments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fullMockAttemptId" TEXT,
    "task1SubmissionId" TEXT,
    "task2SubmissionId" TEXT,
    "status" "WritingAssessmentStatus" NOT NULL DEFAULT 'PENDING',
    "task1Band" DOUBLE PRECISION,
    "task2Band" DOUBLE PRECISION,
    "writingBand" DOUBLE PRECISION,
    "report" JSONB,
    "model" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_assessment_runs" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_assessment_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "writing_assessments_fullMockAttemptId_key" ON "writing_assessments"("fullMockAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "writing_assessments_task1SubmissionId_key" ON "writing_assessments"("task1SubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "writing_assessments_task2SubmissionId_key" ON "writing_assessments"("task2SubmissionId");

-- CreateIndex
CREATE INDEX "writing_assessments_studentId_createdAt_idx" ON "writing_assessments"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "writing_assessments_status_updatedAt_idx" ON "writing_assessments"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "writing_assessment_runs_assessmentId_idx" ON "writing_assessment_runs"("assessmentId");

-- CreateIndex
CREATE INDEX "writing_assessment_runs_createdAt_idx" ON "writing_assessment_runs"("createdAt");

-- AddForeignKey
ALTER TABLE "writing_assessments" ADD CONSTRAINT "writing_assessments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_assessments" ADD CONSTRAINT "writing_assessments_fullMockAttemptId_fkey" FOREIGN KEY ("fullMockAttemptId") REFERENCES "full_mock_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_assessments" ADD CONSTRAINT "writing_assessments_task1SubmissionId_fkey" FOREIGN KEY ("task1SubmissionId") REFERENCES "writing_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_assessments" ADD CONSTRAINT "writing_assessments_task2SubmissionId_fkey" FOREIGN KEY ("task2SubmissionId") REFERENCES "writing_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_assessment_runs" ADD CONSTRAINT "writing_assessment_runs_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "writing_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

