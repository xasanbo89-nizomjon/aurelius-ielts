-- AlterTable
ALTER TABLE "mock_access_codes" ADD COLUMN     "maxRedemptions" INTEGER DEFAULT 1,
ADD COLUMN     "redemptionCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "mock_access_code_redemptions" (
    "id" TEXT NOT NULL,
    "accessCodeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mock_access_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mock_access_code_redemptions_studentId_idx" ON "mock_access_code_redemptions"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "mock_access_code_redemptions_accessCodeId_studentId_key" ON "mock_access_code_redemptions"("accessCodeId", "studentId");

-- AddForeignKey
ALTER TABLE "mock_access_code_redemptions" ADD CONSTRAINT "mock_access_code_redemptions_accessCodeId_fkey" FOREIGN KEY ("accessCodeId") REFERENCES "mock_access_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_access_code_redemptions" ADD CONSTRAINT "mock_access_code_redemptions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every code redeemed before this migration becomes exactly one redemption row (its single redeemer) and a count of 1, so the new per-student gate check sees precisely what the old redeemedByStudentId column did. Nothing about an existing code's behavior changes (maxRedemptions defaults to 1).
INSERT INTO "mock_access_code_redemptions" ("id", "accessCodeId", "studentId", "redeemedAt")
SELECT 'mar_' || "id", "id", "redeemedByStudentId", COALESCE("redeemedAt", CURRENT_TIMESTAMP)
FROM "mock_access_codes"
WHERE "redeemedByStudentId" IS NOT NULL;

UPDATE "mock_access_codes" SET "redemptionCount" = 1 WHERE "redeemedByStudentId" IS NOT NULL;
