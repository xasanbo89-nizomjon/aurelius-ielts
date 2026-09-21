-- CreateEnum
CREATE TYPE "WritingTaskNumber" AS ENUM ('TASK_1', 'TASK_2');

-- CreateEnum
CREATE TYPE "WritingTaskCategory" AS ENUM ('GRAPH', 'TABLE', 'PROCESS', 'MAP', 'OPINION', 'DISCUSSION', 'PROBLEM_SOLUTION', 'ADVANTAGES_DISADVANTAGES');

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "writing_analyses" ADD COLUMN     "coherenceBand" DOUBLE PRECISION,
ADD COLUMN     "grammarBand" DOUBLE PRECISION,
ADD COLUMN     "strengths" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "taskResponseBand" DOUBLE PRECISION,
ADD COLUMN     "vocabularyBand" DOUBLE PRECISION,
ADD COLUMN     "weaknesses" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "writing_submissions" ADD COLUMN     "category" "WritingTaskCategory",
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "taskId" TEXT;

-- CreateTable
CREATE TABLE "writing_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "taskNumber" "WritingTaskNumber" NOT NULL,
    "category" "WritingTaskCategory" NOT NULL,
    "prompt" TEXT NOT NULL,
    "visualDescription" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_feedback" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weakestArea" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "basedOnSubmissionCount" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "writing_tasks_createdById_isPublished_idx" ON "writing_tasks"("createdById", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "writing_feedback_studentId_key" ON "writing_feedback"("studentId");

-- AddForeignKey
ALTER TABLE "writing_submissions" ADD CONSTRAINT "writing_submissions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "writing_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_tasks" ADD CONSTRAINT "writing_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_feedback" ADD CONSTRAINT "writing_feedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
