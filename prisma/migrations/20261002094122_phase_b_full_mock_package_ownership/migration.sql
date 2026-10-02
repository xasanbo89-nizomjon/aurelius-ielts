-- AlterTable
ALTER TABLE "mock_tests" ADD COLUMN     "packageFullMockTestId" TEXT;

-- CreateIndex
CREATE INDEX "mock_tests_packageFullMockTestId_idx" ON "mock_tests"("packageFullMockTestId");

-- AddForeignKey
ALTER TABLE "mock_tests" ADD CONSTRAINT "mock_tests_packageFullMockTestId_fkey" FOREIGN KEY ("packageFullMockTestId") REFERENCES "full_mock_tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
