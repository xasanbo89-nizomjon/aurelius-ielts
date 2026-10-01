/*
  Warnings:

  - The primary key for the `skill_cover_images` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `skill_cover_images` table. All the data in the column will be lost.
  - You are about to drop the column `teacherId` on the `skill_cover_images` table. All the data in the column will be lost.
  - Added the required column `updatedById` to the `skill_cover_images` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "skill_cover_images" DROP CONSTRAINT "skill_cover_images_teacherId_fkey";

-- DropIndex
DROP INDEX "skill_cover_images_teacherId_skill_key";

-- AlterTable
ALTER TABLE "skill_cover_images" DROP CONSTRAINT "skill_cover_images_pkey",
DROP COLUMN "id",
DROP COLUMN "teacherId",
ADD COLUMN     "updatedById" TEXT NOT NULL,
ADD CONSTRAINT "skill_cover_images_pkey" PRIMARY KEY ("skill");

-- AddForeignKey
ALTER TABLE "skill_cover_images" ADD CONSTRAINT "skill_cover_images_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
