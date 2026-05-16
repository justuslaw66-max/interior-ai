export {};

async function main() {
  const fs = await import("fs/promises");
  const yamlCodec = await import("yaml");

  const prismaModule = await import("../lib/prisma");
  const prisma = (
    prismaModule as unknown as {
      prisma: {
        user: {
          findUnique: (args: unknown) => Promise<{ id: string } | null>;
        };
        session: {
          create: (args: unknown) => Promise<unknown>;
          deleteMany: (args: unknown) => Promise<unknown>;
        };
        $disconnect: () => Promise<void>;
      };
    }
  ).prisma;

  const yamlModule = await import("../lib/catalog-yaml");
  const getFreshCatalogYamlMap = (
    yamlModule as unknown as {
      getFreshCatalogYamlMap: () => Map<
        string,
        {
          file_path?: string;
          preset_validation?: {
            publishable: boolean;
            missingRequiredFields: string[];
            invalidEnumFields: Array<{ key: string; value: string; allowed: string[] }>;
            invalidPositiveNumberFields: string[];
          };
        }
      >;
    }
  ).getFreshCatalogYamlMap;

  const admin = await prisma.user.findUnique({
    where: { email: "justuslaw66@gmail.com" },
    select: { id: true },
  });
  if (!admin) throw new Error("Admin user not found");

  const yamlByAsset = getFreshCatalogYamlMap();
  const candidate = Array.from(yamlByAsset.entries()).find(
    ([, value]) => value?.preset_validation && value.preset_validation.publishable === false
  );
  const publishableCandidate = Array.from(yamlByAsset.entries()).find(
    ([, value]) => value?.preset_validation && value.preset_validation.publishable === true && !!value.file_path
  );

  let assetId = "";
  let yaml: {
    file_path?: string;
    preset_validation?: {
      publishable: boolean;
      missingRequiredFields: string[];
      invalidEnumFields: Array<{ key: string; value: string; allowed: string[] }>;
      invalidPositiveNumberFields: string[];
    };
  } | null = null;

  let mutatedFilePath: string | null = null;
  let originalFileContent: string | null = null;

  if (candidate) {
    [assetId, yaml] = candidate;
  } else if (publishableCandidate) {
    [assetId, yaml] = publishableCandidate;
    mutatedFilePath = yaml?.file_path ?? null;
    if (!mutatedFilePath) {
      throw new Error("Publishable candidate did not include file path.");
    }

    originalFileContent = await fs.readFile(mutatedFilePath, "utf8");
    const parsed = yamlCodec.parse(originalFileContent) as Record<string, unknown>;

    // Force non-publishable state via positive-number validation failure.
    parsed.price_usd = 0;
    await fs.writeFile(mutatedFilePath, yamlCodec.stringify(parsed), "utf8");
  } else {
    throw new Error("No preset-linked catalog entries found.");
  }

  const sessionToken = `temp-admin-${Date.now()}`;
  await prisma.session.create({
    data: {
      sessionToken,
      userId: admin.id,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const cookie = `authjs.session-token=${sessionToken}`;

  try {
    const response = await fetch(`http://localhost:3000/api/admin/models/${assetId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ approved: true }),
    });

    const rawText = await response.text();
    let payload: unknown = {};
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { rawText: rawText.slice(0, 6000) };
    }

    console.log(
      JSON.stringify(
        {
          testedAssetId: assetId,
          catalogFilePath: yaml?.file_path ?? null,
          presetPublishableBeforeMutation: yaml?.preset_validation?.publishable ?? null,
          usedTemporaryMutation: Boolean(mutatedFilePath),
          status: response.status,
          payload,
        },
        null,
        2
      )
    );
  } finally {
    if (mutatedFilePath && originalFileContent != null) {
      await fs.writeFile(mutatedFilePath, originalFileContent, "utf8");
    }

    await prisma.session.deleteMany({ where: { sessionToken } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
