-- CreateEnum
CREATE TYPE "TrialAuditAction" AS ENUM ('TRIAL_RESET_90', 'TRIAL_EXTEND_30');

-- CreateTable
CREATE TABLE "trial_audit_logs" (
    "id" TEXT NOT NULL,
    "rootTeacherId" TEXT,
    "studentId" TEXT,
    "action" "TrialAuditAction" NOT NULL,
    "previousExpiryDate" TIMESTAMP(3),
    "newExpiryDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trial_audit_logs_studentId_idx" ON "trial_audit_logs"("studentId");

-- CreateIndex
CREATE INDEX "trial_audit_logs_createdAt_idx" ON "trial_audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "trial_audit_logs" ADD CONSTRAINT "trial_audit_logs_rootTeacherId_fkey" FOREIGN KEY ("rootTeacherId") REFERENCES "teacher_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_audit_logs" ADD CONSTRAINT "trial_audit_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
