import { isQaEnabled } from "@/lib/qa";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ModelDownloadCell from "./ModelDownloadCell";

export const dynamic = "force-dynamic";

export default async function ModelsDebugPage() {
  const allowModelsTest = isQaEnabled();

  if (!allowModelsTest) {
    notFound();
  }

  const assets = await prisma.modelAsset.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-4">Model Assets Debug</h1>
      <p className="mb-6 text-gray-600">
        Total models: <strong>{assets.length}</strong>
      </p>

      <div className="space-y-3 mb-8">
        {assets.map((asset: (typeof assets)[number]) => {
          return (
            <div key={asset.id} className="border rounded p-4 bg-gray-50">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold">{asset.id}</h3>
                  <p className="text-sm text-gray-600 break-all">{asset.modelUrl}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {asset.dimsWmm}×{asset.dimsDmm}×{asset.dimsHmm}mm • 
                    {asset.approved ? " ✓ Approved" : " ⏳ Pending"}
                  </p>
                </div>
                <div className="text-right">
                  <ModelDownloadCell modelUrl={asset.modelUrl} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
