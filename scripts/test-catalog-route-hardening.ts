export {};

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";

type CatalogItemSnapshot = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  defaultVariantId: string | null;
  variantsJson: unknown;
  assetId: string;
  asset: {
    approved: boolean;
  };
};

type TestResult = {
  name: string;
  passed: boolean;
  details?: Record<string, unknown>;
};

const BASE_URL = process.env.CATALOG_ROUTE_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.CATALOG_ROUTE_ADMIN_EMAIL ?? "justuslaw66@gmail.com";

function findCatalogYamlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findCatalogYamlFiles(fullPath));
      continue;
    }

    if (entry.name === "catalog.yaml") {
      results.push(fullPath);
    }
  }

  return results;
}

function getLinkedYamlAssetIds() {
  const catalogDir = path.join(process.cwd(), "catalog", "furniture");
  const assetIds = new Set<string>();

  for (const filePath of findCatalogYamlFiles(catalogDir)) {
    try {
      const parsed = parse(fs.readFileSync(filePath, "utf8")) as {
        assets?: {
          asset_id?: string;
        };
      } | null;

      const assetId = parsed?.assets?.asset_id;
      if (assetId) {
        assetIds.add(assetId);
      }
    } catch {
      // Ignore malformed YAML in this lightweight route test harness.
    }
  }

  return assetIds;
}

async function main() {
  const prismaModule = await import("../lib/prisma");
  const prisma = (
    prismaModule as unknown as {
      prisma: {
        user: {
          findUnique: (args: unknown) => Promise<{ id: string } | null>;
        };
        modelAsset: {
          create: (args: unknown) => Promise<unknown>;
          deleteMany: (args: unknown) => Promise<unknown>;
        };
        catalogItem: {
          create: (args: unknown) => Promise<unknown>;
          findUnique: (args: unknown) => Promise<unknown>;
          deleteMany: (args: unknown) => Promise<unknown>;
        };
        session: {
          create: (args: unknown) => Promise<unknown>;
          deleteMany: (args: unknown) => Promise<unknown>;
        };
        $disconnect: () => Promise<void>;
      };
    }
  ).prisma;

  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });

  if (!admin) {
    throw new Error(`Admin user not found for ${ADMIN_EMAIL}`);
  }

  const suffix = `${Date.now()}`;
  const assetId = `temp-catalog-route-hardening-${suffix}`;
  const catalogItemId = `temp-catalog-route-hardening-item-${suffix}`;
  const yamlDir = path.join(process.cwd(), "catalog", "furniture", "_route_hardening", assetId);
  const yamlFilePath = path.join(yamlDir, "catalog.yaml");

  await prisma.modelAsset.create({
    data: {
      id: assetId,
      modelUrl: `/tmp/${assetId}.glb`,
      thumbUrl: `/tmp/${assetId}.png`,
      notes: "Temporary asset for catalog route hardening checks.",
      aabbCenterX: 0,
      aabbCenterY: 0,
      aabbCenterZ: 0,
      aabbSizeX: 2,
      aabbSizeY: 1,
      aabbSizeZ: 1,
      approved: true,
      dimsDmm: 900,
      dimsHmm: 800,
      dimsWmm: 2200,
      groundAligned: true,
      pivotOffsetX: 0,
      pivotOffsetZ: 0,
    },
  });

  await prisma.catalogItem.create({
    data: {
      id: catalogItemId,
      assetId,
      slug: `temp-catalog-route-hardening-${suffix}`,
      title: "Temporary Catalog Route Hardening Sofa",
      description: "Temporary record for route hardening checks.",
      defaultVariantId: "default",
      dimsDmm: 900,
      dimsHmm: 800,
      dimsWmm: 2200,
      placementRulesJson: {},
      clearanceRulesJson: {},
      tags: ["temporary"],
      variantsJson: [{ id: "default", title: "Default" }],
      category: "sofa",
      styleTags: ["modern"],
      toneTags: ["neutral"],
      roomTags: ["living_room"],
    },
  });

  await fsPromises.mkdir(yamlDir, { recursive: true });
  await fsPromises.writeFile(
    yamlFilePath,
    stringify({
      brand: "Test Brand",
      category: "sofa",
      product_family: "Route Hardening",
      product_name: "Temporary Catalog Route Hardening Sofa",
      price_usd: 1999,
      price_band: "premium",
      dimensions: {
        width_cm: 220,
        depth_cm: 90,
        height_cm: 80,
      },
      seat_capacity: 3,
      size_class: "large",
      material_family: "upholstered",
      style_cluster: "modern",
      color_family: "beige",
      tone: "neutral",
      assets: {
        asset_id: assetId,
        model_url: `/tmp/${assetId}.glb`,
        thumbnail_url: `/tmp/${assetId}.png`,
      },
    }),
    "utf8"
  );

  const catalogItem = (await prisma.catalogItem.findUnique({
    where: { id: catalogItemId },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      defaultVariantId: true,
      variantsJson: true,
      assetId: true,
      asset: {
        select: {
          approved: true,
        },
      },
    },
  })) as CatalogItemSnapshot | null;

  if (!catalogItem) {
    throw new Error("Failed to create temporary catalog item for testing.");
  }

  const sessionToken = `temp-admin-${Date.now()}`;
  await prisma.session.create({
    data: {
      sessionToken,
      userId: admin.id,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const cookie = `authjs.session-token=${sessionToken}`;
  const routeUrl = `${BASE_URL}/api/admin/catalog/${catalogItem.id}`;

  async function callRoute(targetId: string, body: unknown) {
    const response = await fetch(`${BASE_URL}/api/admin/catalog/${targetId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    let payload: unknown = {};
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { rawText: rawText.slice(0, 4000) };
    }

    return {
      status: response.status,
      payload,
    };
  }

  const results: TestResult[] = [];

  try {
    const emptyPatch = await callRoute(catalogItem.id, { db: { foo: "bar" } });
    results.push({
      name: "rejects no valid fields",
      passed: emptyPatch.status === 400,
      details: emptyPatch,
    });

    const invalidCategory = await callRoute(catalogItem.id, { db: { category: "not_a_real_category" } });
    results.push({
      name: "rejects invalid category",
      passed: invalidCategory.status === 400,
      details: invalidCategory,
    });

    const invalidVariant = await callRoute(catalogItem.id, {
      db: {
        defaultVariantId: "missing-variant",
        variantsJson: [{ id: "known-variant", title: "Known Variant" }],
      },
    });
    results.push({
      name: "rejects inconsistent default variant",
      passed: invalidVariant.status === 400,
      details: invalidVariant,
    });

    const nextTitle = `Hardening Test ${Date.now()}`;
    const safeUpdate = await callRoute(catalogItem.id, {
      db: {
        title: nextTitle,
        foo: "ignored",
      },
      ignoredTopLevel: true,
    });

    const afterSafeUpdate = (await prisma.catalogItem.findUnique({
      where: { id: catalogItem.id },
      select: {
        title: true,
        slug: true,
        description: true,
      },
    })) as { title: string; slug: string; description: string | null } | null;

    results.push({
      name: "preserves omitted fields and ignores unknown keys",
      passed:
        safeUpdate.status === 200 &&
        afterSafeUpdate?.title === nextTitle &&
        afterSafeUpdate.slug === catalogItem.slug &&
        afterSafeUpdate.description === catalogItem.description,
      details: {
        response: safeUpdate,
        before: {
          title: catalogItem.title,
          slug: catalogItem.slug,
          description: catalogItem.description,
        },
        after: afterSafeUpdate,
      },
    });

    const linkedYamlAssetIds = getLinkedYamlAssetIds();
    const publishGate = await callRoute(catalogItem.id, {
      yaml: {
        product_name: null,
      },
    });

    results.push({
      name: "blocks approved-asset publish regression",
      passed: linkedYamlAssetIds.has(catalogItem.assetId) && publishGate.status === 400,
      details: {
        response: publishGate,
        linkedYamlDetected: linkedYamlAssetIds.has(catalogItem.assetId),
      },
    });
  } catch (error) {
    if (
      error instanceof TypeError &&
      typeof error.message === "string" &&
      (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED"))
    ) {
      throw new Error(
        `Failed to reach ${routeUrl}. Start the Next.js app and rerun npm run test:catalog-route-hardening.`
      );
    }

    throw error;
  } finally {
    await prisma.catalogItem.deleteMany({ where: { id: catalogItemId } });
    await prisma.modelAsset.deleteMany({ where: { id: assetId } });
    await fsPromises.rm(yamlDir, { recursive: true, force: true });
    await prisma.session.deleteMany({ where: { sessionToken } });
    await prisma.$disconnect();
  }

  const failed = results.filter((result) => !result.passed);
  
  // Compact summary reporter
  const passed = results.filter((result) => result.passed);
  console.log(`\n=== Catalog Route Hardening Tests ===`);
  console.log(`✓ Passed: ${passed.length}/${results.length}`);
  
  if (failed.length > 0) {
    console.log(`✗ Failed: ${failed.length}`);
    failed.forEach((test, i) => {
      console.log(`  ${i + 1}. ${test.name}`);
    });
    process.exit(1);
  } else {
    console.log(`All tests passed.\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});