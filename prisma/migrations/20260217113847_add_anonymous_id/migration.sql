-- AlterTable
ALTER TABLE "Design" ADD COLUMN     "anonymousId" VARCHAR(64),
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Design_userId_idx" ON "Design"("userId");

-- CreateIndex
CREATE INDEX "Design_anonymousId_idx" ON "Design"("anonymousId");
