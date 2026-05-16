-- Normalize unique-index naming across environments.
DROP INDEX IF EXISTS "VariantFinishMapping_catalogItemId_variantId_component_branFin";
DROP INDEX IF EXISTS "VariantFinishMapping_catalogItemId_variantId_component_bran_key";

CREATE UNIQUE INDEX "VariantFinishMapping_catalogItemId_variantId_component_bran_key"
  ON "VariantFinishMapping"("catalogItemId", "variantId", "component", "brandFinishId");
