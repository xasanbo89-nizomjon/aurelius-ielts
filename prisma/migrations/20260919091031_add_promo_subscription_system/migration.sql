-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_planId_fkey";

-- AlterTable
ALTER TABLE "promo_codes" ADD COLUMN     "bonusTrialDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "planId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "promo_code_redemptions" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "discountPercent" DOUBLE PRECISION,
    "bonusTrialDays" INTEGER NOT NULL DEFAULT 0,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promo_code_redemptions_promoCodeId_studentId_key" ON "promo_code_redemptions"("promoCodeId", "studentId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint: every promo code must start with "AZ" — enforced at the
-- database level as defense-in-depth alongside the application-level check
-- in src/lib/promo-codes.ts, so no future code path can insert a code that
-- breaks the format, even by mistake.
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_code_prefix_check" CHECK ("code" LIKE 'AZ%');
