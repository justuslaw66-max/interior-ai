import type { Metadata } from "next";
import Link from "next/link";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { AdminPageHeader } from "../AdminPageHeader";
import { adminSection, adminTitle } from "../admin-navigation";
import { auth } from "../admin-session";

const SECTION = adminSection("/admin/models");

export const metadata: Metadata = { title: adminTitle(SECTION.title) };

export default async function ModelsPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) return null;

  const assets = await prisma.modelAsset.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <div className="p-6">
      <AdminPageHeader
        crumbs={[{ title: SECTION.title }]}
        title={SECTION.title}
        description="Every 3D model, newest change first. Open one to check it and approve it."
      />
      <div className="mt-4 grid grid-cols-4 gap-4">
        {assets.map((a: (typeof assets)[number]) => (
          <Link key={a.id} href={`/admin/models/${a.id}`} className="rounded-xl border p-3 hover:bg-muted">
            <div className="text-sm font-medium">{a.id}</div>
            <div className="text-xs opacity-70">{a.modelUrl}</div>
            <div className="mt-2 text-xs">
              {a.dimsWmm}×{a.dimsDmm}×{a.dimsHmm} mm
            </div>
            <div className="mt-1 text-xs">{a.approved ? "✅ Approved" : "⚠️ Not approved"}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
