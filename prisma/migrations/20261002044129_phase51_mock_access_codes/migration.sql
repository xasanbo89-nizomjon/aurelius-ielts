-- AlterTable
ALTER TABLE "full_mock_attempts" ADD COLUMN     "accessCodeId" TEXT;

-- CreateTable
CREATE TABLE "mock_access_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullMockTestId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "assignedStudentId" TEXT,
    "redeemedByStudentId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mock_access_codes_code_key" ON "mock_access_codes"("code");

-- CreateIndex
CREATE INDEX "mock_access_codes_fullMockTestId_idx" ON "mock_access_codes"("fullMockTestId");

-- CreateIndex
CREATE INDEX "mock_access_codes_createdById_idx" ON "mock_access_codes"("createdById");

-- CreateIndex
CREATE INDEX "mock_access_codes_assignedStudentId_idx" ON "mock_access_codes"("assignedStudentId");

-- CreateIndex
CREATE INDEX "mock_access_codes_redeemedByStudentId_idx" ON "mock_access_codes"("redeemedByStudentId");

-- CreateIndex
CREATE INDEX "full_mock_attempts_accessCodeId_idx" ON "full_mock_attempts"("accessCodeId");

-- AddForeignKey
ALTER TABLE "full_mock_attempts" ADD CONSTRAINT "full_mock_attempts_accessCodeId_fkey" FOREIGN KEY ("accessCodeId") REFERENCES "mock_access_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_access_codes" ADD CONSTRAINT "mock_access_codes_fullMockTestId_fkey" FOREIGN KEY ("fullMockTestId") REFERENCES "full_mock_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_access_codes" ADD CONSTRAINT "mock_access_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_access_codes" ADD CONSTRAINT "mock_access_codes_assignedStudentId_fkey" FOREIGN KEY ("assignedStudentId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_access_codes" ADD CONSTRAINT "mock_access_codes_redeemedByStudentId_fkey" FOREIGN KEY ("redeemedByStudentId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
