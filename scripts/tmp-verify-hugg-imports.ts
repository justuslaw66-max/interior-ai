import { prisma } from "../lib/prisma";

async function main() {
  const ids = [
    "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed",
    "coffee-real-castlery-hugg-nesting-square-performance-basalt-opened",
    "coffee-real-castlery-hugg-nesting-square-performance-dune-closed",
    "coffee-real-castlery-hugg-nesting-square-performance-dune-opened",
  ];

  const rows = await prisma.modelAsset.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      modelUrl: true,
      thumbUrl: true,
      approved: true,
      updatedAt: true,
    },
    orderBy: { id: "asc" },
  });

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
