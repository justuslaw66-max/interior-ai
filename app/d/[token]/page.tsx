import { prisma } from "@/lib/prisma";
import DesignerCanvas from "@/components/DesignerCanvas";
import { notFound } from "next/navigation";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicDesignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const design = await prisma.design.findFirst({
    where: { shareToken: token, shareEnabled: true },
  });

  if (!design) return notFound();

  return (
    <DesignerCanvas
      initialItems={design.items as any}
      roomWidth={design.roomWidth}
      roomDepth={design.roomDepth}
      readOnly
    />
  );
}
