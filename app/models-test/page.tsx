import { prisma } from "@/lib/prisma";

export default async function ModelsDebugPage() {
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
        {assets.map((asset) => {
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
                  <a
                    href={asset.modelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                  >
                    Download
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            // Client-side check for each model
            document.querySelectorAll('a[target="_blank"]').forEach(link => {
              const url = link.href;
              fetch(url, { method: 'HEAD' })
                .then(r => r.ok ? 'Found' : r.status)
                .then(status => {
                  const parent = link.parentElement;
                  if (status === 'Found') {
                    parent.innerHTML = '<span class="text-green-600 text-xs font-bold">✓ Available</span>';
                  } else {
                    parent.innerHTML = '<span class="text-red-600 text-xs font-bold">✗ Missing</span>';
                  }
                })
                .catch(() => {
                  link.parentElement.innerHTML = '<span class="text-red-600 text-xs font-bold">✗ Error</span>';
                });
            });
          `,
        }}
      />
    </div>
  );
}
