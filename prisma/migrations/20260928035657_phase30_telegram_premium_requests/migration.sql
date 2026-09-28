-- CreateEnum
CREATE TYPE "PremiumRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PremiumPlanCode" AS ENUM ('ONE_MONTH', 'THREE_MONTHS', 'SIX_MONTHS');

-- AlterEnum
ALTER TYPE "PremiumSource" ADD VALUE 'TELEGRAM_PURCHASE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrialAuditAction" ADD VALUE 'PREMIUM_TELEGRAM_APPROVE';
ALTER TYPE "TrialAuditAction" ADD VALUE 'PREMIUM_TELEGRAM_REJECT';

-- CreateTable
CREATE TABLE "premium_requests" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "planCode" "PremiumPlanCode" NOT NULL,
    "priceLabel" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "status" "PremiumRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "premium_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "premium_requests_studentId_idx" ON "premium_requests"("studentId");

-- CreateIndex
CREATE INDEX "premium_requests_status_idx" ON "premium_requests"("status");

-- AddForeignKey
ALTER TABLE "premium_requests" ADD CONSTRAINT "premium_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premium_requests" ADD CONSTRAINT "premium_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "teacher_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
