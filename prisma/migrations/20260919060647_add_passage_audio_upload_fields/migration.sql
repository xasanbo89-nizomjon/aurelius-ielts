-- AlterTable
ALTER TABLE "passages" ADD COLUMN     "audioFileName" TEXT,
ADD COLUMN     "audioMimeType" TEXT,
ADD COLUMN     "audioPath" TEXT,
ADD COLUMN     "audioSize" INTEGER;
