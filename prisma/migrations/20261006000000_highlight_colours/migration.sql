ALTER TYPE "HighlightColor" ADD VALUE IF NOT EXISTS 'RED';
ALTER TABLE "question_highlights" ADD COLUMN "color" "HighlightColor" NOT NULL DEFAULT 'YELLOW';
