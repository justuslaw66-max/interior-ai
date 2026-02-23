/**
 * Seed Test Catalog Data (JavaScript version)
 * Usage: node scripts/seed-test-data.js
 */

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function seedTestData() {
  try {
    console.log("🌱 Seeding test catalog data...\n");

    // Create ModelAsset
    const modelAsset = await prisma.modelAsset.create({
      data: {
        slug: "test-sofa-01",
        modelUrl: "/assets/models/test-sofa-01.glb",
        thumbUrl: "/assets/thumbs/test-sofa-01.png",
        dimensionsJson: JSON.stringify({
          w: 2400,
          d: 900,
          h: 800,
        }),
        boundsJson: JSON.stringify({
          type: "aabb",
          size: { w: 2400, d: 900, h: 800 },
          center: [0, 0, 400],
        }),
        pivotJson: JSON.stringify({
          offsetX: 0,
          offsetZ: 0,
          groundAligned: true,
        }),
        status: "active",
        notes: "Test sofa model for catalog system",
      },
    });

    console.log("✓ ModelAsset created:");
    console.log(`  ID: ${modelAsset.id}`);
    console.log(`  Slug: ${modelAsset.slug}\n`);

    // Create CatalogItem
    const catalogItem = await prisma.catalogItem.create({
      data: {
        slug: "test-sofa-01",
        title: "Test Sofa - Charcoal",
        category: "sofa",
        modelAssetId: modelAsset.id,
        materialsProfile: JSON.stringify({
          primary: "linen",
          accent: "oak",
        }),
        placementRules: JSON.stringify({
          minDistFromWall: 0,
          centerPreferred: false,
          allowCorner: true,
        }),
        clearanceRules: JSON.stringify({
          front: 800,
          sides: 300,
          back: 200,
        }),
        styleTags: JSON.stringify(["modern", "minimal"]),
        roomTags: JSON.stringify(["living", "office"]),
        toneTags: JSON.stringify(["warm", "neutral"]),
        aiRoles: JSON.stringify(["focal-point", "statement"]),
        variants: JSON.stringify([
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
        defaultVariantId: "charcoal",
        status: "active",
      },
    });

    console.log("✓ CatalogItem created:");
    console.log(`  ID: ${catalogItem.id}`);
    console.log(`  Title: ${catalogItem.title}`);
    console.log(`  Category: ${catalogItem.category}\n`);

    // Create CommerceMapping
    const commerceMapping = await prisma.commerceMapping.create({
      data: {
        catalogItemId: catalogItem.id,
        mappingType: "shopify",
        shopifyProductId: "gid://shopify/Product/123456789",
        shopifyVariantId: "gid://shopify/ProductVariant/987654321",
      },
    });

    console.log("✓ CommerceMapping created:");
    console.log(`  ID: ${commerceMapping.id}`);
    console.log(`  Type: ${commerceMapping.mappingType}\n`);

    console.log("✅ Test data seeded successfully!\n");
    console.log("Created:");
    console.log(`  • ModelAsset: ${modelAsset.slug}`);
    console.log(`  • CatalogItem: ${catalogItem.title}`);
    console.log(`  • CommerceMapping: shopify\n`);

  } catch (error) {
    console.error("❌ Error seeding data:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData();
