-- CreateTable
CREATE TABLE "writing_task_assignments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "writing_task_assignments_studentId_idx" ON "writing_task_assignments"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "writing_task_assignments_taskId_studentId_key" ON "writing_task_assignments"("taskId", "studentId");

-- AddForeignKey
ALTER TABLE "writing_task_assignments" ADD CONSTRAINT "writing_task_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "writing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_task_assignments" ADD CONSTRAINT "writing_task_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
