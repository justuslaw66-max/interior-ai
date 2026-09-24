import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header/AppHeader";
import { MyDesignsSignedOut } from "@/components/my-designs/MyDesignsSignedOut";
import { MyDesignsView } from "@/components/my-designs/MyDesignsView";
import { auth } from "@/lib/auth";
import { designLimitForPlan } from "@/lib/design-limits";
import { buildMyDesignCard } from "@/lib/my-designs";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "My designs · Interior AI" };

const PAGE = "flex min-h-screen flex-col bg-[#fafaf9] text-neutral-950";

/**
 * My designs (audit findings MD1–MD4 and MD6), laid out as in the mockup. Guests get a sign-in
 * prompt. The editor's More → My designs saves the design, then comes here.
 */
export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return (
      <div className={PAGE}>
        <AppHeader current="designs" account={null} />
        <MyDesignsSignedOut />
      </div>
    );
  }

  const [designs, user] = await Promise.all([
    prisma.design.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, updatedAt: true, shareEnabled: true,
        roomWidth: true, roomDepth: true, items: true, snapshot: true,
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }),
  ]);
  const now = new Date();
  const limit = designLimitForPlan(user?.plan);
  const account = {
    name: session.user?.name ?? null,
    email: session.user?.email ?? null,
    planLabel: limit === null ? "Pro plan" : "Free plan",
  };

  return (
    <div className={PAGE}>
      <AppHeader current="designs" account={account} />
      <MyDesignsView designs={designs.map((design) => buildMyDesignCard(design, now))} limit={limit} />
    </div>
  );
}
