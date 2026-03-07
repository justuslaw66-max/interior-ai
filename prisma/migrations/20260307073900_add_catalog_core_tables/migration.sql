-- CreateEnum
CREATE TYPE "CatalogCategory" AS ENUM (
  'sofa',
  'coffee_table',
  'rug',
  'tv_console',
  'accent_chair',
  'floor_lamp'
);

-- CreateEnum
CREATE TYPE "CommerceType" AS ENUM (
  'shopify',
  'affiliate',
  'not_buyable'
);

-- CreateTable
CREATE TABLE "CatalogItem" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "defaultVariantId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "aiRolesJson" JSONB,
  "assetId" TEXT NOT NULL,
  "clearanceRulesJson" JSONB,
  "dimsDmm" INTEGER NOT NULL,
  "dimsHmm" INTEGER NOT NULL,
  "dimsWmm" INTEGER NOT NULL,
  "placementRulesJson" JSONB,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "variantsJson" JSONB,
  "category" "CatalogCategory" NOT NULL,
  "styleTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "toneTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "roomTags" TEXT[] DEFAULT ARRAY[]::TEXT[],

  CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceMapping" (
  "id" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "shopifyVariantId" TEXT,
  "affiliateUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "retailer" TEXT,
  "type" "CommerceType" NOT NULL,

  CONSTRAINT "CommerceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_slug_key" ON "CatalogItem"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceMapping_catalogItemId_key" ON "CommerceMapping"("catalogItemId");

-- AddForeignKey
ALTER TABLE "CommerceMapping"
  ADD CONSTRAINT "CommerceMapping_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
