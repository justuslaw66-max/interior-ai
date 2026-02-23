// app/admin/models/[id]/page.tsx
import { prisma } from "@/lib/prisma";
import ModelViewer from "./viewer";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { redirect } from "next/navigation";

export default async function ModelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const { id } = await params;

  const asset = await prisma.modelAsset.findUnique({
    where: { id },
  });

  if (!asset) {
    return <div className="p-6">Not found</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{asset!.id}</h1>
      <div className="mt-2 text-sm opacity-70">{asset!.modelUrl}</div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div
          className="col-span-2 rounded-2xl border overflow-hidden"
          style={{ height: 560 }}
        >
          <ModelViewer asset={asset!} />
        </div>
        <div className="rounded-2xl border p-4 text-sm">
          <div>
            <b>Dims</b>: {asset!.dimsWmm}×{asset!.dimsDmm}×{asset!.dimsHmm} mm
          </div>
          <div className="mt-2">
            <b>AABB size</b>: {asset!.aabbSizeX.toFixed(3)},{" "}
            {asset!.aabbSizeY.toFixed(3)}, {asset!.aabbSizeZ.toFixed(3)}
          </div>
          <div>
            <b>AABB center</b>: {asset!.aabbCenterX.toFixed(3)},{" "}
            {asset!.aabbCenterY.toFixed(3)}, {asset!.aabbCenterZ.toFixed(3)}
          </div>
          <div className="mt-3">
            <b>Approved</b>: {asset!.approved ? "Yes" : "No"}
          </div>
        </div>
      </div>
    </div>
  );
}