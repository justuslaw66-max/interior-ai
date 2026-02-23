-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "id" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "userId" TEXT,
    "designId" TEXT,
    "currency" TEXT,
    "total" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopifyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyOrder_orderRef_key" ON "ShopifyOrder"("orderRef");

-- CreateIndex
CREATE INDEX "ShopifyOrder_userId_idx" ON "ShopifyOrder"("userId");

-- CreateIndex
CREATE INDEX "ShopifyOrder_designId_idx" ON "ShopifyOrder"("designId");
