-- AlterTable
ALTER TABLE "mock_tests" ADD COLUMN     "versionOfId" TEXT;

-- AlterTable
ALTER TABLE "passages" ADD COLUMN     "audioStartSeconds" INTEGER;

-- AlterTable
ALTER TABLE "writing_tasks" ADD COLUMN     "bundleId" TEXT,
ADD COLUMN     "visualPdfPage" INTEGER,
ADD COLUMN     "visualPdfUrl" TEXT;

-- CreateIndex
CREATE INDEX "writing_tasks_bundleId_idx" ON "writing_tasks"("bundleId");

-- AddForeignKey
ALTER TABLE "mock_tests" ADD CONSTRAINT "mock_tests_versionOfId_fkey" FOREIGN KEY ("versionOfId") REFERENCES "mock_tests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

