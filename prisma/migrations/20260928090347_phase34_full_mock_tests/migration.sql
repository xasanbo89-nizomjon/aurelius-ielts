-- CreateEnum
CREATE TYPE "MockTestDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "FullMockTestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FullMockSectionType" AS ENUM ('LISTENING', 'READING', 'WRITING', 'SPEAKING');

-- CreateEnum
CREATE TYPE "FullMockAttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "mock_tests" ADD COLUMN     "difficulty" "MockTestDifficulty";

-- CreateTable
CREATE TABLE "full_mock_tests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImagePath" TEXT,
    "status" "FullMockTestStatus" NOT NULL DEFAULT 'DRAFT',
    "estimatedBandMin" DOUBLE PRECISION,
    "estimatedBandMax" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "full_mock_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "full_mock_reading_sections" (
    "id" TEXT NOT NULL,
    "fullMockTestId" TEXT NOT NULL,
    "mockTestId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "full_mock_reading_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "full_mock_listening_sections" (
    "id" TEXT NOT NULL,
    "fullMockTestId" TEXT NOT NULL,
    "mockTestId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "full_mock_listening_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "full_mock_writing_sections" (
    "id" TEXT NOT NULL,
    "fullMockTestId" TEXT NOT NULL,
    "writingTaskId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "full_mock_writing_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "full_mock_speaking_sections" (
    "id" TEXT NOT NULL,
    "fullMockTestId" TEXT NOT NULL,
    "speakingTaskId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "full_mock_speaking_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "full_mock_attempts" (
    "id" TEXT NOT NULL,
    "fullMockTestId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "FullMockAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentSection" "FullMockSectionType" NOT NULL DEFAULT 'LISTENING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "full_mock_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "full_mock_section_results" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "section" "FullMockSectionType" NOT NULL,
    "partNumber" INTEGER,
    "resultId" TEXT,
    "writingSubmissionId" TEXT,
    "speakingSubmissionId" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "full_mock_section_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "full_mock_reading_sections_fullMockTestId_mockTestId_key" ON "full_mock_reading_sections"("fullMockTestId", "mockTestId");

-- CreateIndex
CREATE UNIQUE INDEX "full_mock_listening_sections_fullMockTestId_mockTestId_key" ON "full_mock_listening_sections"("fullMockTestId", "mockTestId");

-- CreateIndex
CREATE UNIQUE INDEX "full_mock_writing_sections_writingTaskId_key" ON "full_mock_writing_sections"("writingTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "full_mock_speaking_sections_speakingTaskId_key" ON "full_mock_speaking_sections"("speakingTaskId");

-- CreateIndex
CREATE INDEX "full_mock_attempts_studentId_idx" ON "full_mock_attempts"("studentId");

-- CreateIndex
CREATE INDEX "full_mock_attempts_fullMockTestId_idx" ON "full_mock_attempts"("fullMockTestId");

-- CreateIndex
CREATE UNIQUE INDEX "full_mock_section_results_resultId_key" ON "full_mock_section_results"("resultId");

-- CreateIndex
CREATE UNIQUE INDEX "full_mock_section_results_writingSubmissionId_key" ON "full_mock_section_results"("writingSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "full_mock_section_results_speakingSubmissionId_key" ON "full_mock_section_results"("speakingSubmissionId");

-- CreateIndex
CREATE INDEX "full_mock_section_results_attemptId_idx" ON "full_mock_section_results"("attemptId");

-- AddForeignKey
ALTER TABLE "full_mock_tests" ADD CONSTRAINT "full_mock_tests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_reading_sections" ADD CONSTRAINT "full_mock_reading_sections_fullMockTestId_fkey" FOREIGN KEY ("fullMockTestId") REFERENCES "full_mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_reading_sections" ADD CONSTRAINT "full_mock_reading_sections_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_listening_sections" ADD CONSTRAINT "full_mock_listening_sections_fullMockTestId_fkey" FOREIGN KEY ("fullMockTestId") REFERENCES "full_mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_listening_sections" ADD CONSTRAINT "full_mock_listening_sections_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_writing_sections" ADD CONSTRAINT "full_mock_writing_sections_fullMockTestId_fkey" FOREIGN KEY ("fullMockTestId") REFERENCES "full_mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_writing_sections" ADD CONSTRAINT "full_mock_writing_sections_writingTaskId_fkey" FOREIGN KEY ("writingTaskId") REFERENCES "writing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_speaking_sections" ADD CONSTRAINT "full_mock_speaking_sections_fullMockTestId_fkey" FOREIGN KEY ("fullMockTestId") REFERENCES "full_mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_speaking_sections" ADD CONSTRAINT "full_mock_speaking_sections_speakingTaskId_fkey" FOREIGN KEY ("speakingTaskId") REFERENCES "speaking_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_attempts" ADD CONSTRAINT "full_mock_attempts_fullMockTestId_fkey" FOREIGN KEY ("fullMockTestId") REFERENCES "full_mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_attempts" ADD CONSTRAINT "full_mock_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_section_results" ADD CONSTRAINT "full_mock_section_results_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "full_mock_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_section_results" ADD CONSTRAINT "full_mock_section_results_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_section_results" ADD CONSTRAINT "full_mock_section_results_writingSubmissionId_fkey" FOREIGN KEY ("writingSubmissionId") REFERENCES "writing_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "full_mock_section_results" ADD CONSTRAINT "full_mock_section_results_speakingSubmissionId_fkey" FOREIGN KEY ("speakingSubmissionId") REFERENCES "speaking_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
