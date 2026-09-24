-- CreateEnum
CREATE TYPE "PremiumSource" AS ENUM ('COIN_REDEMPTION', 'ADMIN_GRANT', 'DIRECT_PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CLICK', 'PAYME');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AchievementCode" ADD VALUE 'STREAK_7_DAYS';
ALTER TYPE "AchievementCode" ADD VALUE 'FIRST_WRITING_SUBMISSION';
ALTER TYPE "AchievementCode" ADD VALUE 'FIRST_SPEAKING_SUBMISSION';
ALTER TYPE "AchievementCode" ADD VALUE 'FIRST_PREMIUM_MONTH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CoinTransactionType" ADD VALUE 'WEEKLY_BONUS';
ALTER TYPE "CoinTransactionType" ADD VALUE 'MONTHLY_BONUS';
ALTER TYPE "CoinTransactionType" ADD VALUE 'ADMIN_GRANT';
ALTER TYPE "CoinTransactionType" ADD VALUE 'ADMIN_DEDUCT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TrialAuditAction" ADD VALUE 'PREMIUM_GRANT';
ALTER TYPE "TrialAuditAction" ADD VALUE 'PREMIUM_REMOVE';

-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN     "dailyStudyCoinCap" INTEGER NOT NULL DEFAULT 45;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "providerType" "PaymentProvider";

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "source" "PremiumSource";

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "paymentId" TEXT,
    "planId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_paymentId_key" ON "invoices"("paymentId");

-- CreateIndex
CREATE INDEX "invoices_studentId_idx" ON "invoices"("studentId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
