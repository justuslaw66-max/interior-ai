/**
 * Seed Test Catalog Data
 * 
 * Creates sample ModelAsset, CatalogItem, and CommerceMapping for testing
 * Usage: node scripts/seed-test-data.ts
 */

import { prisma } from "../lib/prisma";

async function seedTestData() {
  try {
    console.log("🌱 Seeding test catalog data...\n");

    // =========================================================================
    // Create ModelAsset
    // =========================================================================
    const modelAsset = await prisma.modelAsset.create({
      data: {
        id: "asset_test_sofa_01",
        modelUrl: "/assets/models/test-sofa-01.glb",
        thumbUrl: "/assets/thumbs/test-sofa-01.png",
        dimsWmm: 2400,
        dimsDmm: 900,
        dimsHmm: 800,
        aabbSizeX: 2.4,
        aabbSizeY: 0.8,
        aabbSizeZ: 0.9,
        aabbCenterX: 0,
        aabbCenterY: 0.4,
        aabbCenterZ: 0,
        pivotOffsetX: 0,
        pivotOffsetZ: 0,
        groundAligned: true,
        approved: true,
        notes: "Test sofa model for catalog system",
      },
    });

    console.log("✓ ModelAsset created:");
    console.log(`  ID: ${modelAsset.id}`);
    console.log(`  Dims: ${modelAsset.dimsWmm}×${modelAsset.dimsDmm}×${modelAsset.dimsHmm} mm\n`);

    // =========================================================================
    // Create CatalogItem
    // =========================================================================
    const catalogItem = await prisma.catalogItem.create({
      data: {
        id: "cat_test_sofa_01",
        slug: "test-sofa-01",
        title: "Test Sofa - Charcoal",
        category: "sofa",
        assetId: modelAsset.id,
        dimsWmm: 2400,
        dimsDmm: 900,
        dimsHmm: 800,
        variantsJson: JSON.stringify([
          {
            id: "charcoal",
            name: "Charcoal",
            color: "#3a3a3a",
          },
          {
            id: "cream",
            name: "Cream",
            color: "#f5f5dc",
          },
        ]),
        placementRulesJson: JSON.stringify({
          minDistFromWall: 0,
          centerPreferred: false,
          allowCorner: true,
        }),
        clearanceRulesJson: JSON.stringify({
          front: 800,
          sides: 300,
          back: 200,
        }),
      },
    });

    console.log("✓ CatalogItem created:");
    console.log(`  ID: ${catalogItem.id}`);
    console.log(`  Title: ${catalogItem.title}`);
    console.log(`  Category: ${catalogItem.category}\n`);

    // =========================================================================
    // Create CommerceMapping (Shopify)
    // =========================================================================
    const commerceMapping = await prisma.commerceMapping.create({
      data: {
        id: "map_test_sofa_shopify",
        catalogItemId: catalogItem.id,
        type: "shopify",
        shopifyVariantId: "gid://shopify/ProductVariant/987654321",
      },
    });

    console.log("✓ CommerceMapping created:");
    console.log(`  ID: ${commerceMapping.id}`);
    console.log(`  Type: ${commerceMapping.type}\n`);

    // =========================================================================
    // Summary
    // =========================================================================
    console.log("✅ Test data seeded successfully!\n");
    console.log("Created:");
    console.log(`  • ModelAsset: ${modelAsset.id}`);
    console.log(`  • CatalogItem: ${catalogItem.title}`);
    console.log(`  • CommerceMapping: shopify\n`);

    console.log("Next steps:");
    console.log("1. View in Prisma Studio: npm run studio");
    console.log("2. Test admin page: http://localhost:3000/admin/models");
    console.log("3. Import a real GLB: node scripts/import-model.ts --file model.glb\n");

  } catch (error) {
    console.error("❌ Error seeding data:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData();
