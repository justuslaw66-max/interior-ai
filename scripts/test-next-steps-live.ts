export {};

async function main() {
  const prismaModule = await import("../lib/prisma");
  const prisma = (
    prismaModule as unknown as {
      prisma: {
        user: {
          findUnique: (args: unknown) => Promise<{ id: string } | null>;
        };
        modelAsset: {
          findUnique: (args: unknown) => Promise<{ id: string } | null>;
        };
        importJob: {
          create: (args: unknown) => Promise<unknown>;
          findUnique: (args: unknown) => Promise<{ id: string; normalizedAssetId: string | null; catalogItemId: string | null } | null>;
          deleteMany: (args: unknown) => Promise<unknown>;
        };
        catalogItem: {
          findUnique: (args: unknown) => Promise<{ id: string; tags: string[] | null } | null>;
          deleteMany: (args: unknown) => Promise<unknown>;
        };
        session: {
          create: (args: unknown) => Promise<unknown>;
          deleteMany: (args: unknown) => Promise<unknown>;
        };
        $disconnect: () => Promise<void>;
      };
    }
  ).prisma;

  const admin = await prisma.user.findUnique({
    where: { email: "justuslaw66@gmail.com" },
    select: { id: true },
  });
  if (!admin) throw new Error("Admin user not found");

  const fallbackAssetId = "dining-real-castlery-brighton-oval-180";
  const fallbackAsset = await prisma.modelAsset.findUnique({
    where: { id: fallbackAssetId },
    select: { id: true },
  });
  if (!fallbackAsset) throw new Error("Fallback model asset not found");

  const tempImportJobId = `tmp-import-${Date.now()}`;
  await prisma.importJob.create({
    data: {
      id: tempImportJobId,
      status: "needs_mapping",
      sourceFileName: "tmp-brighton.glb",
      sourceFileUrl: "https://example.com/tmp-brighton.glb",
      normalizedAssetId: fallbackAssetId,
      catalogItemId: null,
    },
  });

  const importJob = await prisma.importJob.findUnique({
    where: { id: tempImportJobId },
    select: { id: true, normalizedAssetId: true, catalogItemId: true },
  });
  if (!importJob?.normalizedAssetId) throw new Error("Temporary import job setup failed");

  const sessionToken = `temp-admin-${Date.now()}`;
  await prisma.session.create({
    data: {
      sessionToken,
      userId: admin.id,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const cookie = `authjs.session-token=${sessionToken}`;

  const modelRes = await fetch(`http://localhost:3000/api/admin/models/${importJob.normalizedAssetId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ foo: "bar" }),
  });
  const modelPayload = await modelRes.json().catch(() => ({}));

  const linkRes = await fetch(`http://localhost:3000/api/admin/imports/${importJob.id}/link-catalog`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
  });
  const linkPayload = await linkRes.json().catch(() => ({}));

  const createdCatalogItemId =
    linkRes.ok && typeof linkPayload?.catalogItemId === "string" ? linkPayload.catalogItemId : null;

  if (createdCatalogItemId) {
    const createdCatalogItem = await prisma.catalogItem.findUnique({
      where: { id: createdCatalogItemId },
      select: { id: true, tags: true },
    });

    if (createdCatalogItem?.tags?.includes("linked-from-import")) {
      await prisma.catalogItem.deleteMany({ where: { id: createdCatalogItemId } });
    }
  }

  await prisma.importJob.deleteMany({ where: { id: tempImportJobId } });

  await prisma.session.deleteMany({ where: { sessionToken } });

  console.log(
    JSON.stringify(
      {
        importJobId: importJob.id,
        normalizedAssetId: importJob.normalizedAssetId,
        beforeCatalogItemId: importJob.catalogItemId,
        modelPatchStatus: modelRes.status,
        modelPatchPayload: modelPayload,
        linkStatus: linkRes.status,
        linkPayload,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
