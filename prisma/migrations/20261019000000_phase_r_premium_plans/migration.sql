-- AlterTable
ALTER TABLE "premium_requests" ADD COLUMN     "planId" TEXT,
ADD COLUMN     "planName" TEXT,
ADD COLUMN     "priceAmount" DOUBLE PRECISION,
ADD COLUMN     "priceCurrency" TEXT,
ALTER COLUMN "planCode" DROP NOT NULL;

-- CreateTable
CREATE TABLE "premium_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "badge" TEXT,
    "features" JSONB NOT NULL DEFAULT '[]',
    "telegramLink" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "legacyCode" "PremiumPlanCode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "premium_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "premium_plans_legacyCode_key" ON "premium_plans"("legacyCode");

-- CreateIndex
CREATE INDEX "premium_plans_isActive_sortOrder_idx" ON "premium_plans"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "premium_requests" ADD CONSTRAINT "premium_requests_planId_fkey" FOREIGN KEY ("planId") REFERENCES "premium_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Seed: the three plans on sale today, with today's prices, so nothing changes until the Root Teacher edits them (legacyCode ties each to its old PremiumPlanCode).
INSERT INTO "premium_plans" ("id", "name", "durationDays", "price", "currency", "badge", "features", "isActive", "sortOrder", "legacyCode", "updatedAt") VALUES
  ('premium_plan_one_month',    '1 Month Premium',  30,  9,  'USD', NULL,         '["AI Writing Center","AI Explain More","AI Study Coach","AI Speaking Evaluation","Premium Analytics","Premium Articles"]'::jsonb, true, 1, 'ONE_MONTH',    CURRENT_TIMESTAMP),
  ('premium_plan_three_months', '3 Months Premium', 90,  25, 'USD', 'POPULAR',    '["AI Writing Center","AI Explain More","AI Study Coach","AI Speaking Evaluation","Premium Analytics","Premium Articles"]'::jsonb, true, 2, 'THREE_MONTHS', CURRENT_TIMESTAMP),
  ('premium_plan_six_months',   '6 Months Premium', 180, 70, 'USD', 'BEST VALUE', '["AI Writing Center","AI Explain More","AI Study Coach","AI Speaking Evaluation","Premium Analytics","Premium Articles"]'::jsonb, true, 3, 'SIX_MONTHS',   CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
