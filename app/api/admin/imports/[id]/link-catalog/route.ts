import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";

type DbCatalogCategory =
  | "sofa"
  | "coffee_table"
  | "rug"
  | "tv_console"
  | "accent_chair"
  | "floor_lamp";

function mapCategoryToDb(yamlCategory: string | undefined, assetId: string): DbCatalogCategory {
  if (yamlCategory === "sofa") return "sofa";
  if (yamlCategory === "rug") return "rug";
  if (yamlCategory === "tv_console") return "tv_console";
  if (yamlCategory === "sideboard") return "tv_console";
  if (yamlCategory === "accent_chair" || yamlCategory === "armchair" || yamlCategory === "dining_chair") {
    return "accent_chair";
  }
  if (yamlCategory === "floor_lamp" || yamlCategory === "pendant_light") return "floor_lamp";
  if (yamlCategory === "dining_table" || yamlCategory === "side_table") return "coffee_table";

  if (assetId.startsWith("sofa-")) return "sofa";
  if (assetId.startsWith("rug-")) return "rug";
  if (assetId.startsWith("lamp-") || assetId.startsWith("light-")) return "floor_lamp";
  if (assetId.startsWith("chair-") || assetId.startsWith("armchair-")) return "accent_chair";
  if (assetId.startsWith("tv-") || assetId.startsWith("console-")) return "tv_console";
  return "coffee_table";
}

function safeSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const prismaCompat = prisma as unknown as {
    importJob: {
      findUnique: (args: {
        where: { id: string };
        select: {
          id: true;
          sourceFileName: true;
          normalizedAssetId: true;
          catalogItemId: true;
        };
      }) => Promise<{
        id: string;
        sourceFileName: string;
        normalizedAssetId: string | null;
        catalogItemId: string | null;
      } | null>;
      update: (args: {
        where: { id: string };
        data: { catalogItemId: string | null };
      }) => Promise<unknown>;
    };
    modelAsset: {
      findUnique: (args: {
        where: { id: string };
        select: {
          id: true;
          dimsWmm: true;
          dimsDmm: true;
          dimsHmm: true;
        };
      }) => Promise<{
        id: string;
        dimsWmm: number;
        dimsDmm: number;
        dimsHmm: number;
      } | null>;
    };
    catalogItem: {
      findUnique: (args: { where: { id?: string; slug?: string } }) => Promise<{ id: string } | null>;
      findFirst: (args: {
        where: { assetId: string };
        orderBy: { updatedAt: "desc" };
        select: { id: true };
      }) => Promise<{ id: string } | null>;
      create: (args: {
        data: {
          id: string;
          slug: string;
          title: string;
          description: string | null;
          defaultVariantId: string;
          assetId: string;
          dimsWmm: number;
          dimsDmm: number;
          dimsHmm: number;
          category: DbCatalogCategory;
          tags: string[];
          styleTags: string[];
          toneTags: string[];
          roomTags: string[];
          variantsJson: Array<{ id: string; title: string }>;
        };
      }) => Promise<{ id: string }>;
    };
  };

  const job = await prismaCompat.importJob.findUnique({
    where: { id },
    select: {
      id: true,
      sourceFileName: true,
      normalizedAssetId: true,
      catalogItemId: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }

  if (!job.normalizedAssetId) {
    return NextResponse.json({ error: "Import job does not have a linked normalized asset id" }, { status: 400 });
  }

  if (job.catalogItemId) {
    return NextResponse.json({ ok: true, catalogItemId: job.catalogItemId, created: false });
  }

  const existingByAsset = await prismaCompat.catalogItem.findFirst({
    where: { assetId: job.normalizedAssetId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (existingByAsset) {
    await prismaCompat.importJob.update({
      where: { id: job.id },
      data: { catalogItemId: existingByAsset.id },
    });
    return NextResponse.json({ ok: true, catalogItemId: existingByAsset.id, created: false });
  }

  const asset = await prismaCompat.modelAsset.findUnique({
    where: { id: job.normalizedAssetId },
    select: {
      id: true,
      dimsWmm: true,
      dimsDmm: true,
      dimsHmm: true,
    },
  });

  if (!asset) {
    return NextResponse.json({ error: "Linked model asset not found" }, { status: 404 });
  }

  const yaml = getFreshCatalogYamlMap().get(asset.id);
  const category = mapCategoryToDb(yaml?.category, asset.id);
  const title = yaml?.product_name || job.sourceFileName.replace(/\.[^.]+$/, "") || asset.id;
  const variantName = yaml?.variant || "Default";

  let nextId = `catalog-${safeSlug(asset.id)}`;
  let counter = 1;
  while (await prismaCompat.catalogItem.findUnique({ where: { id: nextId } })) {
    counter += 1;
    nextId = `catalog-${safeSlug(asset.id)}-${counter}`;
  }

  let nextSlug = safeSlug(`${title}-${variantName}`) || safeSlug(asset.id);
  while (await prismaCompat.catalogItem.findUnique({ where: { slug: nextSlug } })) {
    counter += 1;
    nextSlug = `${safeSlug(`${title}-${variantName}`)}-${counter}`;
  }

  const created = await prismaCompat.catalogItem.create({
    data: {
      id: nextId,
      slug: nextSlug,
      title,
      description: yaml?.product_family ? `${yaml.product_family}${yaml.variant ? ` · ${yaml.variant}` : ""}` : null,
      defaultVariantId: "default",
      assetId: asset.id,
      dimsWmm: asset.dimsWmm,
      dimsDmm: asset.dimsDmm,
      dimsHmm: asset.dimsHmm,
      category,
      tags: ["imported", "linked-from-import"],
      styleTags: yaml?.style_cluster ? [yaml.style_cluster] : [],
      toneTags: yaml?.tone ? [yaml.tone] : [],
      roomTags: Array.isArray(yaml?.room_compatibility) ? yaml.room_compatibility : [],
      variantsJson: [{ id: "default", title: variantName }],
    },
  });

  await prismaCompat.importJob.update({
    where: { id: job.id },
    data: { catalogItemId: created.id },
  });

  return NextResponse.json({ ok: true, catalogItemId: created.id, created: true });
}
