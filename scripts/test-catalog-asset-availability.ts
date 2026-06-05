import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { findCatalogFiles, getRelativeCatalogPath, isDraftCatalogEntry } from "../lib/catalog-audit";

type AssetRef = {
  owner: string;
  kind: "model" | "thumb" | "variantThumb";
  url: string;
  isDraft: boolean;
};

type CatalogEntry = {
  status?: string;
  publication_state?: string;
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

const CHECK_REMOTE =
  String(process.env.CATALOG_CHECK_REMOTE_ASSETS ?? (process.env.CI ? "true" : "false")).toLowerCase() ===
  "true";
const REMOTE_TIMEOUT_MS = Number(process.env.CATALOG_REMOTE_TIMEOUT_MS ?? 6000);
const REMOTE_RETRIES = Math.max(0, Number(process.env.CATALOG_REMOTE_RETRIES ?? 2));
const REMOTE_RETRY_BACKOFF_MS = Math.max(0, Number(process.env.CATALOG_REMOTE_RETRY_BACKOFF_MS ?? 250));
const REMOTE_MAX_FAILURES = Math.max(0, Number(process.env.CATALOG_REMOTE_MAX_FAILURES ?? 0));
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

function shouldRetryRemote(result: RemoteCheckResult): boolean {
  if (result.ok) return false;
  if (typeof result.status !== "number") return true;
  if (result.status === 408 || result.status === 429) return true;
  return result.status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkRemoteUrlOnce(url: string): Promise<RemoteCheckResult> {
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

async function checkRemoteUrl(url: string): Promise<RemoteCheckResult> {
  let lastResult: RemoteCheckResult = { ok: false };
  for (let attempt = 0; attempt <= REMOTE_RETRIES; attempt += 1) {
    lastResult = await checkRemoteUrlOnce(url);
    if (!shouldRetryRemote(lastResult) || attempt === REMOTE_RETRIES) {
      return lastResult;
    }
    await sleep(REMOTE_RETRY_BACKOFF_MS * (attempt + 1));
  }
  return lastResult;
}

function isValidAssetUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  if (!isRemoteUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function splitOwnersByPublication(owners: AssetRef[]): { active: AssetRef[]; draft: AssetRef[] } {
  return {
    active: owners.filter((owner) => !owner.isDraft),
    draft: owners.filter((owner) => owner.isDraft),
  };
}

function formatOwners(owners: AssetRef[]): string {
  return owners.map((entry) => `${entry.owner} (${entry.kind})`).join(", ");
}

function collectAssetsFromCatalog(): { filesScanned: number; refs: AssetRef[] } {
  const refs: AssetRef[] = [];
  const files = findCatalogFiles(CATALOG_ROOT);

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = parse(raw) as CatalogEntry;
    const rel = getRelativeCatalogPath(filePath);
    const assetId = normalizeUrl(parsed.assets?.asset_id) ?? rel;
    const isDraft = isDraftCatalogEntry(parsed);

    const modelUrl = normalizeUrl(parsed.assets?.model_url);
    if (!modelUrl) {
      refs.push({ owner: assetId, kind: "model", url: "__MISSING_MODEL_URL__", isDraft });
    } else {
      refs.push({ owner: assetId, kind: "model", url: modelUrl, isDraft });
    }

    const thumbUrl = normalizeUrl(parsed.assets?.thumbnail_url);
    if (!thumbUrl) {
      refs.push({ owner: assetId, kind: "thumb", url: "__MISSING_THUMBNAIL_URL__", isDraft });
    } else {
      refs.push({ owner: assetId, kind: "thumb", url: thumbUrl, isDraft });
    }

    for (const variant of parsed.variants ?? []) {
      const variantThumb = normalizeUrl(variant.thumbnail_url);
      if (!variantThumb) continue;
      const variantLabel = normalizeUrl(variant.variant) ?? "variant";
      refs.push({
        owner: `${assetId}/${variantLabel}`,
        kind: "variantThumb",
        url: variantThumb,
        isDraft,
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

  const blockingLines: string[] = [];
  const warningLines: string[] = [];
  const remoteFailureLines: string[] = [];

  for (const [url, owners] of unique.entries()) {
    if (url === "__MISSING_MODEL_URL__" || url === "__MISSING_THUMBNAIL_URL__") {
      const { active, draft } = splitOwnersByPublication(owners);
      if (active.length > 0) {
        blockingLines.push(`- REQUIRED FIELD MISSING: ${url} <- ${formatOwners(active)}`);
      }
      if (draft.length > 0) {
        warningLines.push(`- draft blocker: REQUIRED FIELD MISSING: ${url} <- ${formatOwners(draft)}`);
      }
      continue;
    }

    if (!isValidAssetUrl(url)) {
      const { active, draft } = splitOwnersByPublication(owners);
      if (active.length > 0) {
        blockingLines.push(`- INVALID URL: ${url} <- ${formatOwners(active)}`);
      }
      if (draft.length > 0) {
        warningLines.push(`- draft blocker: INVALID URL: ${url} <- ${formatOwners(draft)}`);
      }
      continue;
    }

    if (isRemoteUrl(url)) {
      if (!CHECK_REMOTE) continue;
      remoteChecked += 1;
      const result = await checkRemoteUrl(url);
      if (!result.ok) {
        remoteMissing += 1;
        const { active, draft } = splitOwnersByPublication(owners);
        if (active.length > 0) {
          remoteFailureLines.push(
            `- REMOTE ${result.method ?? "N/A"} ${result.status ?? "ERR"}: ${url} <- ${formatOwners(active)}`
          );
        }
        if (draft.length > 0) {
          warningLines.push(
            `- draft blocker: REMOTE ${result.method ?? "N/A"} ${result.status ?? "ERR"}: ${url} <- ${formatOwners(draft)}`
          );
        }
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
      const { active, draft } = splitOwnersByPublication(owners);
      if (active.length > 0) {
        blockingLines.push(`- LOCAL MISSING: ${url} <- ${formatOwners(active)}`);
      }
      if (draft.length > 0) {
        warningLines.push(`- draft blocker: LOCAL MISSING: ${url} <- ${formatOwners(draft)}`);
      }
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
  if (CHECK_REMOTE) {
    console.log(`- remote max failures allowed: ${REMOTE_MAX_FAILURES}`);
  }

  if (remoteFailureLines.length > 0) {
    if (remoteMissing > REMOTE_MAX_FAILURES) {
      blockingLines.push(...remoteFailureLines);
    } else {
      console.log("\nRemote asset warnings (within allowed threshold):");
      for (const line of remoteFailureLines) {
        console.log(line);
      }
    }
  }

  if (warningLines.length > 0) {
    console.log("\nDraft asset warnings:");
    for (const line of warningLines) {
      console.log(line);
    }
  }

  if (blockingLines.length > 0) {
    console.log("\nMissing/unreachable asset URLs:");
    for (const line of blockingLines) {
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
