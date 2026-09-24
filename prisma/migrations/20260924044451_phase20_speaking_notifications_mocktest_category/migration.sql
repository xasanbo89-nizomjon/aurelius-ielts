/*
  Warnings:

  - Added the required column `taskId` to the `speaking_submissions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MockTestCategory" AS ENUM ('CAMBRIDGE', 'GENERAL');

-- CreateEnum
CREATE TYPE "SpeakingTaskStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "mock_tests" ADD COLUMN     "category" "MockTestCategory" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "speaking_submissions" ADD COLUMN     "taskId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "speaking_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "part" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "SpeakingTaskStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speaking_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_reads" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "speaking_tasks_code_key" ON "speaking_tasks"("code");

-- CreateIndex
CREATE INDEX "speaking_tasks_createdById_status_idx" ON "speaking_tasks"("createdById", "status");

-- CreateIndex
CREATE INDEX "notification_reads_studentId_idx" ON "notification_reads"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_reads_studentId_updateId_key" ON "notification_reads"("studentId", "updateId");

-- CreateIndex
CREATE INDEX "speaking_submissions_taskId_idx" ON "speaking_submissions"("taskId");

-- CreateIndex
CREATE INDEX "speaking_submissions_studentId_idx" ON "speaking_submissions"("studentId");

-- AddForeignKey
ALTER TABLE "speaking_tasks" ADD CONSTRAINT "speaking_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_submissions" ADD CONSTRAINT "speaking_submissions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "speaking_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
