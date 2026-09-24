-- AlterTable
ALTER TABLE "speaking_submissions" ADD COLUMN     "evaluatedAt" TIMESTAMP(3),
ADD COLUMN     "improvements" JSONB,
ADD COLUMN     "strengths" JSONB,
ADD COLUMN     "teacherNotes" TEXT,
ADD COLUMN     "weaknesses" JSONB,
ALTER COLUMN "audioUrl" DROP NOT NULL;
