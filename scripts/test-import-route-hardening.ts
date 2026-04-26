export {};

type TestResult = {
  name: string;
  passed: boolean;
  details?: Record<string, unknown>;
};

const BASE_URL = process.env.IMPORT_ROUTE_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.IMPORT_ROUTE_ADMIN_EMAIL ?? "justuslaw66@gmail.com";

async function main() {
  const prismaModule = await import("../lib/prisma");
  const prisma = (
    prismaModule as unknown as {
      prisma: {
        user: {
          findUnique: (args: unknown) => Promise<{ id: string } | null>;
        };
        importJob: {
          update: (args: unknown) => Promise<unknown>;
          findUnique: (args: unknown) => Promise<{
            status: string;
            notes: string | null;
            errorMessage: string | null;
          } | null>;
          deleteMany: (args: unknown) => Promise<unknown>;
        };
        modelAsset: {
          create: (args: unknown) => Promise<unknown>;
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

  const createImportJobModule = await import("../lib/import-jobs/create-import-job");
  const createImportJob = (
    createImportJobModule as unknown as {
      createImportJob: (input: {
        sourceFileName: string;
        sourceFileUrl: string;
        notes?: string;
        status?:
          | "received"
          | "normalizing"
          | "optimized"
          | "preview_generated"
          | "metadata_extracted"
          | "needs_mapping"
          | "needs_review"
          | "approved"
          | "published"
          | "failed";
      }) => Promise<{ id: string }>;
    }
  ).createImportJob;

  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });

  if (!admin) {
    throw new Error(`Admin user not found for ${ADMIN_EMAIL}`);
  }

  const suffix = `${Date.now()}`;
  const assetId = `temp-import-route-hardening-${suffix}`;
  const notesJob = await createImportJob({
    sourceFileName: `temp-import-route-hardening-${suffix}.glb`,
    sourceFileUrl: `https://example.com/temp-import-route-hardening-${suffix}.glb`,
    notes: "Original notes",
    status: "needs_review",
  });
  const publishJob = await createImportJob({
    sourceFileName: `temp-import-route-publish-${suffix}.glb`,
    sourceFileUrl: `https://example.com/temp-import-route-publish-${suffix}.glb`,
    notes: "Publish job",
    status: "needs_review",
  });

  await prisma.importJob.update({
    where: { id: notesJob.id },
    data: {
      errorMessage: "Original error",
    },
  });

  await prisma.modelAsset.create({
    data: {
      id: assetId,
      modelUrl: `/tmp/${assetId}.glb`,
      thumbUrl: `/tmp/${assetId}.png`,
      notes: "Temporary asset for import route hardening checks.",
      aabbCenterX: 0,
      aabbCenterY: 0,
      aabbCenterZ: 0,
      aabbSizeX: 2,
      aabbSizeY: 1,
      aabbSizeZ: 1,
      approved: false,
      dimsDmm: 900,
      dimsHmm: 800,
      dimsWmm: 2200,
      groundAligned: true,
      pivotOffsetX: 0,
      pivotOffsetZ: 0,
    },
  });

  await prisma.importJob.update({
    where: { id: publishJob.id },
    data: {
      normalizedAssetId: assetId,
    },
  });

  const sessionToken = `temp-admin-${Date.now()}`;
  await prisma.session.create({
    data: {
      sessionToken,
      userId: admin.id,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const cookie = `authjs.session-token=${sessionToken}`;

  async function callRoute(jobId: string, body: unknown) {
    const response = await fetch(`${BASE_URL}/api/admin/imports/${jobId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    let payload: unknown = {};
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { rawText: rawText.slice(0, 4000) };
    }

    return {
      status: response.status,
      payload,
    };
  }

  const results: TestResult[] = [];

  try {
    const invalidBody = await callRoute(notesJob.id, []);
    results.push({
      name: "rejects invalid PATCH body",
      passed: invalidBody.status === 400,
      details: invalidBody,
    });

    const noValidFields = await callRoute(notesJob.id, { foo: "bar" });
    results.push({
      name: "rejects no valid fields",
      passed: noValidFields.status === 400,
      details: noValidFields,
    });

    const invalidWorkflowStage = await callRoute(notesJob.id, {
      workflowStage: "not-a-real-stage",
    });
    results.push({
      name: "rejects invalid workflowStage",
      passed: invalidWorkflowStage.status === 400,
      details: invalidWorkflowStage,
    });

    const partialUpdate = await callRoute(notesJob.id, {
      notes: "Updated notes",
      unsafeField: "ignored",
    });

    const afterPartialUpdate = await prisma.importJob.findUnique({
      where: { id: notesJob.id },
      select: {
        status: true,
        notes: true,
        errorMessage: true,
      },
    });

    results.push({
      name: "preserves omitted fields and ignores unknown keys",
      passed:
        partialUpdate.status === 200 &&
        afterPartialUpdate?.status === "needs_review" &&
        afterPartialUpdate?.notes === "Updated notes" &&
        afterPartialUpdate?.errorMessage === "Original error",
      details: {
        response: partialUpdate,
        after: afterPartialUpdate,
      },
    });

    const approvedWithoutAsset = await callRoute(notesJob.id, {
      status: "approved",
    });
    results.push({
      name: "blocks approved transition without normalized asset",
      passed: approvedWithoutAsset.status === 400,
      details: approvedWithoutAsset,
    });

    const publishedWithoutCatalogItem = await callRoute(publishJob.id, {
      status: "published",
    });
    results.push({
      name: "blocks published transition without catalog item",
      passed: publishedWithoutCatalogItem.status === 400,
      details: publishedWithoutCatalogItem,
    });
  } catch (error) {
    if (
      error instanceof TypeError &&
      typeof error.message === "string" &&
      (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED"))
    ) {
      throw new Error(
        `Failed to reach ${BASE_URL}/api/admin/imports/${notesJob.id}. Start the Next.js app and rerun npm run test:import-route-hardening.`
      );
    }

    throw error;
  } finally {
    await prisma.importJob.deleteMany({ where: { id: { in: [notesJob.id, publishJob.id] } } });
    await prisma.modelAsset.deleteMany({ where: { id: assetId } });
    await prisma.session.deleteMany({ where: { sessionToken } });
    await prisma.$disconnect();
  }

  const failed = results.filter((result) => !result.passed);
  
  // Compact summary reporter
  const passed = results.filter((result) => result.passed);
  console.log(`\n=== Import Route Hardening Tests ===`);
  console.log(`✓ Passed: ${passed.length}/${results.length}`);
  
  if (failed.length > 0) {
    console.log(`✗ Failed: ${failed.length}`);
    failed.forEach((test, i) => {
      console.log(`  ${i + 1}. ${test.name}`);
    });
    process.exit(1);
  } else {
    console.log(`All tests passed.\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});