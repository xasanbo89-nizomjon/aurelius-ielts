-- CreateEnum
CREATE TYPE "AIInsightKind" AS ENUM ('MISTAKE_ANALYSIS', 'IMPROVEMENT_PLAN', 'TEACHER_REPORT');

-- AlterTable
ALTER TABLE "speaking_submissions" ADD COLUMN     "fluencyBand" DOUBLE PRECISION,
ADD COLUMN     "grammarBand" DOUBLE PRECISION,
ADD COLUMN     "lexicalBand" DOUBLE PRECISION,
ADD COLUMN     "pronunciationBand" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ai_insight_cache" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "AIInsightKind" NOT NULL,
    "content" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insight_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_insight_cache_studentId_kind_key" ON "ai_insight_cache"("studentId", "kind");

-- AddForeignKey
ALTER TABLE "ai_insight_cache" ADD CONSTRAINT "ai_insight_cache_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
