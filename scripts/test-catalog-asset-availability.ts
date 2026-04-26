import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { findCatalogFiles, getRelativeCatalogPath } from "../lib/catalog-audit";

type AssetRef = {
  owner: string;
  kind: "model" | "thumb" | "variantThumb";
  url: string;
};

type CatalogEntry = {
  assets?: {
    asset_id?: string;
    model_url?: string;
    thumbnail_url?: string;
  };
  variants?: Array<{
    variant?: string;
    thumbnail_url?: string;
  }>;
};

type RemoteCheckResult = {
  ok: boolean;
  status?: number;
  method?: "HEAD" | "GET";
};

const CHECK_REMOTE = String(process.env.CATALOG_CHECK_REMOTE_ASSETS ?? "").toLowerCase() === "true";
const REMOTE_TIMEOUT_MS = Number(process.env.CATALOG_REMOTE_TIMEOUT_MS ?? 6000);
const CATALOG_ROOT = path.join(process.cwd(), "catalog", "furniture");
const ALLOWED_LOCAL_MISSING_MODELS = new Set<string>([
  "storage-real-castlery-sloane-sideboard-150cm",
  "storage-real-castlery-sloane-sideboard-180cm",
]);

function normalizeUrl(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stripQueryAndHash(url: string): string {
  return url.split("?")[0].split("#")[0];
}

function localPublicPath(url: string): string | null {
  const clean = stripQueryAndHash(url);
  if (!clean.startsWith("/")) return null;
  return path.join(process.cwd(), "public", clean.replace(/^\/+/, ""));
}

function isRemoteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

async function checkRemoteUrl(url: string): Promise<RemoteCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (head.ok) {
      return { ok: true, status: head.status, method: "HEAD" };
    }

    if (head.status === 405 || head.status === 403 || head.status === 400) {
      const get = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
      return { ok: get.ok, status: get.status, method: "GET" };
    }

    return { ok: false, status: head.status, method: "HEAD" };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

function collectAssetsFromCatalog(): { filesScanned: number; refs: AssetRef[] } {
  const refs: AssetRef[] = [];
  const files = findCatalogFiles(CATALOG_ROOT);

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = parse(raw) as CatalogEntry;
    const rel = getRelativeCatalogPath(filePath);
    const assetId = normalizeUrl(parsed.assets?.asset_id) ?? rel;

    const modelUrl = normalizeUrl(parsed.assets?.model_url);
    if (modelUrl) {
      refs.push({ owner: assetId, kind: "model", url: modelUrl });
    }

    const thumbUrl = normalizeUrl(parsed.assets?.thumbnail_url);
    if (thumbUrl) {
      refs.push({ owner: assetId, kind: "thumb", url: thumbUrl });
    }

    for (const variant of parsed.variants ?? []) {
      const variantThumb = normalizeUrl(variant.thumbnail_url);
      if (!variantThumb) continue;
      const variantLabel = normalizeUrl(variant.variant) ?? "variant";
      refs.push({
        owner: `${assetId}/${variantLabel}`,
        kind: "variantThumb",
        url: variantThumb,
      });
    }
  }

  return { filesScanned: files.length, refs };
}

async function main() {
  const { filesScanned, refs } = collectAssetsFromCatalog();
  const unique = new Map<string, AssetRef[]>();
  for (const ref of refs) {
    unique.set(ref.url, [...(unique.get(ref.url) ?? []), ref]);
  }

  let localChecked = 0;
  let localMissing = 0;
  let remoteChecked = 0;
  let remoteMissing = 0;

  const missingLines: string[] = [];

  for (const [url, owners] of unique.entries()) {
    if (isRemoteUrl(url)) {
      if (!CHECK_REMOTE) continue;
      remoteChecked += 1;
      const result = await checkRemoteUrl(url);
      if (!result.ok) {
        remoteMissing += 1;
        const ownerStr = owners.map((entry) => `${entry.owner} (${entry.kind})`).join(", ");
        missingLines.push(`- REMOTE ${result.method ?? "N/A"} ${result.status ?? "ERR"}: ${url} <- ${ownerStr}`);
      }
      continue;
    }

    const localPath = localPublicPath(url);
    if (!localPath) continue;
    localChecked += 1;
    if (!fs.existsSync(localPath)) {
      const isAllowedNoModel =
        owners.some((entry) => entry.kind === "model" && ALLOWED_LOCAL_MISSING_MODELS.has(entry.owner));
      if (isAllowedNoModel) {
        continue;
      }
      localMissing += 1;
      const ownerStr = owners.map((entry) => `${entry.owner} (${entry.kind})`).join(", ");
      missingLines.push(`- LOCAL MISSING: ${url} <- ${ownerStr}`);
    }
  }

  console.log("Catalog asset availability summary");
  console.log(`- catalog files scanned: ${filesScanned}`);
  console.log(`- asset refs scanned: ${refs.length}`);
  console.log(`- unique asset URLs: ${unique.size}`);
  console.log(`- local URLs checked: ${localChecked}`);
  console.log(`- local URLs missing: ${localMissing}`);
  console.log(`- remote URLs checked: ${remoteChecked}${CHECK_REMOTE ? "" : " (set CATALOG_CHECK_REMOTE_ASSETS=true to enable)"}`);
  console.log(`- remote URLs failing: ${remoteMissing}`);

  if (missingLines.length > 0) {
    console.log("\nMissing/unreachable asset URLs:");
    for (const line of missingLines) {
      console.log(line);
    }
    throw new Error("Catalog asset availability check failed");
  }

  console.log("\nCatalog asset availability check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
