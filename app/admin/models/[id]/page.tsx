import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/admin";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "../../AdminPageHeader";
import { adminSection, adminTitle } from "../../admin-navigation";
import { auth } from "../../admin-session";
import ModelViewer from "./viewer";
import ModelEditForm from "./model-edit-form";

type ModelPageProps = { params: Promise<{ id: string }> };

const SECTION = adminSection("/admin/models");

export async function generateMetadata({ params }: ModelPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: adminTitle(`Model ${id}`) };
}

export default async function ModelPage({ params }: ModelPageProps) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) return null;

  const { id } = await params;

  const asset = await prisma.modelAsset.findUnique({
    where: { id },
  });
  const linkedCatalogEntry = getFreshCatalogYamlMap().get(id) ?? null;

  if (!asset) notFound();

  return (
    <div className="p-6">
      <AdminPageHeader
        crumbs={[{ title: SECTION.title, href: SECTION.href }, { title: asset.id }]}
        title={`Model ${asset.id}`}
        description={asset.modelUrl}
      />
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div
          className="col-span-2 rounded-2xl border overflow-hidden"
          style={{ height: 560 }}
        >
          <ModelViewer asset={asset} />
        </div>
        <div className="rounded-2xl border p-4 text-sm">
          <div>
            <b>Dims</b>: {asset.dimsWmm}×{asset.dimsDmm}×{asset.dimsHmm} mm
          </div>
          <div className="mt-2">
            <b>AABB size</b>: {asset.aabbSizeX.toFixed(3)},{" "}
            {asset.aabbSizeY.toFixed(3)}, {asset.aabbSizeZ.toFixed(3)}
          </div>
          <div>
            <b>AABB center</b>: {asset.aabbCenterX.toFixed(3)},{" "}
            {asset.aabbCenterY.toFixed(3)}, {asset.aabbCenterZ.toFixed(3)}
          </div>
          <div className="mt-3">
            <b>Approved</b>: {asset.approved ? "Yes" : "No"}
          </div>
          <ModelEditForm asset={asset} catalogEntry={linkedCatalogEntry} />
        </div>
      </div>
    </div>
  );
}