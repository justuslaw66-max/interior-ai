-- CreateEnum
CREATE TYPE "MaterialFamily" AS ENUM (
	'fabric',
	'leather',
	'wood',
	'metal',
	'stone',
	'glass',
	'lacquer',
	'composite',
	'other'
);

-- CreateEnum
CREATE TYPE "ColorFamily" AS ENUM (
	'white',
	'ivory',
	'beige',
	'taupe',
	'brown',
	'grey',
	'charcoal',
	'black',
	'green',
	'blue',
	'red',
	'terracotta',
	'natural'
);

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('warm', 'neutral', 'cool');

-- CreateEnum
CREATE TYPE "Surface" AS ENUM (
	'matte',
	'satin',
	'semi_gloss',
	'gloss',
	'textured',
	'brushed',
	'polished',
	'woven',
	'smooth'
);

-- CreateEnum
CREATE TYPE "Pattern" AS ENUM (
	'plain',
	'boucle',
	'woven',
	'grained',
	'veined',
	'marbled'
);

-- CreateEnum
CREATE TYPE "FinishComponent" AS ENUM (
	'primary',
	'legs',
	'top',
	'base',
	'handle',
	'shade',
	'frame'
);

-- CreateEnum
CREATE TYPE "MappingConfidence" AS ENUM (
	'mapped_auto_confident',
	'mapped_auto_needs_review',
	'manual'
);

-- CreateTable
CREATE TABLE "BrandFinish" (
	"id" TEXT NOT NULL,
	"catalogItemId" TEXT NOT NULL,
	"brandName" TEXT NOT NULL,
	"sourceLabel" TEXT NOT NULL,
	"sourceCode" TEXT,
	"materialFamily" "MaterialFamily",
	"notes" TEXT,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,

	CONSTRAINT "BrandFinish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizedFinish" (
	"id" TEXT NOT NULL,
	"label" TEXT NOT NULL,
	"presentationLabel" TEXT NOT NULL,
	"materialFamily" "MaterialFamily" NOT NULL,
	"colorFamily" "ColorFamily" NOT NULL,
	"tone" "Tone" NOT NULL,
	"surface" "Surface" NOT NULL,
	"pattern" "Pattern",
	"isActive" BOOLEAN NOT NULL DEFAULT true,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,

	CONSTRAINT "NormalizedFinish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantFinishMapping" (
	"id" TEXT NOT NULL,
	"catalogItemId" TEXT NOT NULL,
	"variantId" TEXT NOT NULL,
	"component" "FinishComponent" NOT NULL,
	"brandFinishId" TEXT NOT NULL,
	"normalizedFinishId" TEXT NOT NULL,
	"sourceConfidence" "MappingConfidence" NOT NULL DEFAULT 'manual',
	"needsReview" BOOLEAN NOT NULL DEFAULT false,
	"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" TIMESTAMP(3) NOT NULL,

	CONSTRAINT "VariantFinishMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandFinish_catalogItemId_idx" ON "BrandFinish"("catalogItemId");

-- CreateIndex
CREATE INDEX "BrandFinish_brandName_idx" ON "BrandFinish"("brandName");

-- CreateIndex
CREATE INDEX "BrandFinish_sourceLabel_idx" ON "BrandFinish"("sourceLabel");

-- CreateIndex
CREATE INDEX "NormalizedFinish_materialFamily_idx" ON "NormalizedFinish"("materialFamily");

-- CreateIndex
CREATE INDEX "NormalizedFinish_colorFamily_idx" ON "NormalizedFinish"("colorFamily");

-- CreateIndex
CREATE INDEX "NormalizedFinish_isActive_idx" ON "NormalizedFinish"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VariantFinishMapping_catalogItemId_variantId_component_brandFinishId_key"
	ON "VariantFinishMapping"("catalogItemId", "variantId", "component", "brandFinishId");

-- CreateIndex
CREATE INDEX "VariantFinishMapping_catalogItemId_idx" ON "VariantFinishMapping"("catalogItemId");

-- CreateIndex
CREATE INDEX "VariantFinishMapping_variantId_idx" ON "VariantFinishMapping"("variantId");

-- CreateIndex
CREATE INDEX "VariantFinishMapping_brandFinishId_idx" ON "VariantFinishMapping"("brandFinishId");

-- CreateIndex
CREATE INDEX "VariantFinishMapping_normalizedFinishId_idx" ON "VariantFinishMapping"("normalizedFinishId");

-- CreateIndex
CREATE INDEX "VariantFinishMapping_needsReview_idx" ON "VariantFinishMapping"("needsReview");

-- AddForeignKey
ALTER TABLE "BrandFinish"
	ADD CONSTRAINT "BrandFinish_catalogItemId_fkey"
	FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id")
	ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantFinishMapping"
	ADD CONSTRAINT "VariantFinishMapping_catalogItemId_fkey"
	FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id")
	ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantFinishMapping"
	ADD CONSTRAINT "VariantFinishMapping_brandFinishId_fkey"
	FOREIGN KEY ("brandFinishId") REFERENCES "BrandFinish"("id")
	ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantFinishMapping"
	ADD CONSTRAINT "VariantFinishMapping_normalizedFinishId_fkey"
	FOREIGN KEY ("normalizedFinishId") REFERENCES "NormalizedFinish"("id")
	ON DELETE RESTRICT ON UPDATE CASCADE;
