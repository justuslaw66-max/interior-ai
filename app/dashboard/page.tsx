import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import DeleteAllDesignsButton from "@/components/DeleteAllDesignsButton";
import DesignsListWithSelection from "@/components/DesignsListWithSelection";
import EmptyDesignsState from "@/components/EmptyDesignsState";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const designs = await prisma.design.findMany({
    where: { user: { id: session.user.id } },
    orderBy: { updatedAt: "desc" },
  });

  const designItems = designs.map((design) => ({
    id: design.id,
    title: design.title,
    updatedAt: design.updatedAt.toISOString(),
  }));

  return (
    <main className="min-h-screen bg-neutral-100 p-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Designs</h1>
        <div className="flex items-center gap-2">
          <DeleteAllDesignsButton disabled={designs.length === 0} />
          <Link
            href="/"
            className="rounded-lg bg-white px-3 py-2 text-sm text-neutral-900 shadow hover:bg-neutral-50"
          >
            Main Menu
          </Link>
        </div>
      </div>

      {designItems.length === 0 ? (
        <EmptyDesignsState />
      ) : (
        <DesignsListWithSelection designs={designItems} />
      )}
    </main>
  );
}
