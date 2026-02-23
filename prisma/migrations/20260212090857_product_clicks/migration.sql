-- CreateTable
CREATE TABLE "ProductClick" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "designId" TEXT,
    "productId" TEXT NOT NULL,
    "price" INTEGER,
    "retailer" TEXT,
    "buyUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductClick_designId_idx" ON "ProductClick"("designId");

-- CreateIndex
CREATE INDEX "ProductClick_productId_idx" ON "ProductClick"("productId");

-- CreateIndex
CREATE INDEX "ProductClick_userId_idx" ON "ProductClick"("userId");
