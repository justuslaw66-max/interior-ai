import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

function esc(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await prisma.productClick.findMany({
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const header = [
    "createdAt",
    "productId",
    "designId",
    "userId",
    "price",
    "retailer",
    "buyUrl",
  ];

  const csv =
    header.join(",") +
    "\n" +
    rows
      .map((r) =>
        [
          r.createdAt.toISOString(),
          r.productId,
          r.designId ?? "",
          r.userId ?? "",
          r.price ?? "",
          r.retailer ?? "",
          r.buyUrl ?? "",
        ]
          .map(esc)
          .join(",")
      )
      .join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"product_clicks.csv\"",
    },
  });
}
