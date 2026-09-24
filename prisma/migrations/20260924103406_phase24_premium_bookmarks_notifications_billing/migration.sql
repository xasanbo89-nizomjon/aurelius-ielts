-- AlterEnum
ALTER TYPE "BillingInterval" ADD VALUE 'QUARTERLY';

-- notification_reads table was empty (verified before writing this
-- migration by hand — `prisma migrate dev` refuses to run non-interactively
-- for a change it flags as possibly destructive) — safe to drop and
-- recreate the updateId column as the generalized itemKey.
ALTER TABLE "notification_reads" DROP CONSTRAINT "notification_reads_updateId_fkey";
DROP INDEX "notification_reads_studentId_updateId_key";
ALTER TABLE "notification_reads" DROP COLUMN "updateId";
ALTER TABLE "notification_reads" ADD COLUMN "itemKey" TEXT NOT NULL;
CREATE UNIQUE INDEX "notification_reads_studentId_itemKey_key" ON "notification_reads"("studentId", "itemKey");

-- CreateTable
CREATE TABLE "question_bookmarks" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_bookmarks_studentId_idx" ON "question_bookmarks"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "question_bookmarks_studentId_questionId_key" ON "question_bookmarks"("studentId", "questionId");

-- AddForeignKey
ALTER TABLE "question_bookmarks" ADD CONSTRAINT "question_bookmarks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bookmarks" ADD CONSTRAINT "question_bookmarks_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "writing_task_bookmarks" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_task_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "writing_task_bookmarks_studentId_idx" ON "writing_task_bookmarks"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "writing_task_bookmarks_studentId_taskId_key" ON "writing_task_bookmarks"("studentId", "taskId");

-- AddForeignKey
ALTER TABLE "writing_task_bookmarks" ADD CONSTRAINT "writing_task_bookmarks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_task_bookmarks" ADD CONSTRAINT "writing_task_bookmarks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "writing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
