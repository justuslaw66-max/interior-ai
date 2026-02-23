import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DesignerCanvas from "@/components/DesignerCanvas";

export default async function DesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const design = await prisma.design.findUnique({
    where: { id },
  });

  if (!design || design.userId !== session.user.id) {
    redirect("/dashboard");
  }

  return (
    <DesignerCanvas
      initialItems={design.items as any}
      roomWidth={design.roomWidth}
      roomDepth={design.roomDepth}
    />
  );
}
