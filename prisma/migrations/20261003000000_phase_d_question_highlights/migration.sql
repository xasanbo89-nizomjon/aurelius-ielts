-- CreateTable
CREATE TABLE "question_highlights" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_highlights_resultId_idx" ON "question_highlights"("resultId");

-- AddForeignKey
ALTER TABLE "question_highlights" ADD CONSTRAINT "question_highlights_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_highlights" ADD CONSTRAINT "question_highlights_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
