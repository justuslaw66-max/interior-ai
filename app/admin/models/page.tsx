import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function ModelsPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const assets = await prisma.modelAsset.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Model Assets</h1>
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
