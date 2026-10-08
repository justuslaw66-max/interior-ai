import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { getCatalogPreset } from "@/lib/catalog-presets";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";
import { AdminPageHeader } from "../../AdminPageHeader";
import { adminSection, adminTitle } from "../../admin-navigation";
import { auth } from "../../admin-session";
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

type CatalogItemPageProps = { params: Promise<{ catalogItemId: string }> };

const SECTION = adminSection("/admin/catalog/review");

export async function generateMetadata({ params }: CatalogItemPageProps): Promise<Metadata> {
  const { catalogItemId } = await params;
  return { title: adminTitle(`Catalog item ${catalogItemId}`) };
}

export default async function CatalogItemPage({
  params,
}: CatalogItemPageProps) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) return null;

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
      <AdminPageHeader
        crumbs={[{ title: SECTION.title, href: SECTION.href }, { title: item.id }]}
        title={`Catalog item ${item.id}`}
        description={`Updated ${item.updatedAt.toLocaleString()}`}
        actions={
          <Link href={`/admin/models/${item.assetId}`} className="text-xs text-blue-700 hover:underline">
            Open linked model
          </Link>
        }
      />

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