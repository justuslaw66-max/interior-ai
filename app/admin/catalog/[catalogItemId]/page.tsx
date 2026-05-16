import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getCatalogPreset } from "@/lib/catalog-presets";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";
import CatalogAuthoringEditor from "./CatalogAuthoringEditor";

type CatalogItemDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  defaultVariantId: string | null;
  tags: string[];
  styleTags: string[];
  toneTags: string[];
  roomTags: string[];
  variantsJson: unknown;
  assetId: string;
  updatedAt: Date;
};

export default async function CatalogItemPage({
  params,
}: {
  params: Promise<{ catalogItemId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const { catalogItemId } = await params;

  const prismaCompat = prisma as unknown as {
    catalogItem: {
      findUnique: (args: {
        where: { id: string };
        select: {
          id: true;
          title: true;
          slug: true;
          description: true;
          category: true;
          defaultVariantId: true;
          tags: true;
          styleTags: true;
          toneTags: true;
          roomTags: true;
          variantsJson: true;
          assetId: true;
          updatedAt: true;
        };
      }) => Promise<CatalogItemDetail | null>;
    };
  };

  const item = await prismaCompat.catalogItem.findUnique({
    where: { id: catalogItemId },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      category: true,
      defaultVariantId: true,
      tags: true,
      styleTags: true,
      toneTags: true,
      roomTags: true,
      variantsJson: true,
      assetId: true,
      updatedAt: true,
    },
  });

  if (!item) notFound();

  const linkedYaml = getFreshCatalogYamlMap().get(item.assetId) ?? null;
  const preset = getCatalogPreset(linkedYaml?.category);

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <Link href="/admin" className="text-xs text-blue-600 hover:text-blue-700">Back to admin</Link>
        <h1 className="text-2xl font-semibold">Catalog Item {item.id}</h1>
        <div className="text-sm text-neutral-600">Updated {item.updatedAt.toLocaleString()}</div>
        <div className="flex flex-wrap gap-4 text-xs text-blue-700">
          <Link href={`/admin/models/${item.assetId}`} className="hover:underline">Open linked model</Link>
          <Link href={`/admin/catalog/${item.id}/commerce`} className="hover:underline">Open commerce mapping</Link>
        </div>
      </header>

      <CatalogAuthoringEditor
        initialDb={{
          id: item.id,
          title: item.title,
          slug: item.slug,
          description: item.description ?? "",
          category: item.category,
          defaultVariantId: item.defaultVariantId ?? "",
          tags: item.tags,
          styleTags: item.styleTags,
          toneTags: item.toneTags,
          roomTags: item.roomTags,
          variantsJson: item.variantsJson,
          assetId: item.assetId,
        }}
        initialYaml={linkedYaml}
        initialPreset={preset}
      />
    </div>
  );
}