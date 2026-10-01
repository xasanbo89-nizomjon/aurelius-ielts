-- AlterTable
ALTER TABLE "full_mock_tests" ADD COLUMN     "category" "MockTestCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "difficulty" "MockTestDifficulty",
ADD COLUMN     "examNumber" INTEGER;
