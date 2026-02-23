"use client";

type Row = {
  id: string;
  createdAtLabel: string;
  clickKey: string;
  productId: string;
  retailer: string | null;
  designId: string | null;
};

export default function RecentClicksTable({ rows }: { rows: Row[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-neutral-600">
          <tr>
            <th className="px-3 py-2 text-left">Time</th>
            <th className="px-3 py-2 text-left">Product</th>
            <th className="px-3 py-2 text-left">Retailer</th>
            <th className="px-3 py-2 text-left">Design</th>
            <th className="px-3 py-2 text-left">clickKey</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap">
                {c.createdAtLabel}
              </td>
              <td className="px-3 py-2 font-mono">{c.productId}</td>
              <td className="px-3 py-2">{c.retailer ?? "-"}</td>
              <td className="px-3 py-2 font-mono">{c.designId ?? "-"}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{c.clickKey}</span>
                  <button
                    className="rounded bg-neutral-900 px-2 py-1 text-xs text-white"
                    onClick={async () => {
                      await navigator.clipboard.writeText(c.clickKey);
                      alert("clickKey copied ✅");
                    }}
                  >
                    Copy
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-neutral-600" colSpan={5}>
                No clicks yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
