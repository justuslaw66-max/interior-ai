/*
  Warnings:

  - A unique constraint covering the columns `[shareToken]` on the table `Design` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Design" ADD COLUMN     "shareEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Design_shareToken_key" ON "Design"("shareToken");
