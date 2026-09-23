import fs from "node:fs";
import path from "node:path";

const PREVIEW_ASSET_URL_PREFIX = "/assets/";
const FLOOR_PLAN_PREVIEW_ASSET_ROOT = path.join(
  process.cwd(),
  "public",
  "assets"
);

function containedAssetPath(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

function previewAssetPathname(previewUrl: string) {
  const queryIndex = previewUrl.indexOf("?", PREVIEW_ASSET_URL_PREFIX.length);
  const fragmentIndex = previewUrl.indexOf("#", PREVIEW_ASSET_URL_PREFIX.length);
  const boundaryIndexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);
  return previewUrl.slice(
    PREVIEW_ASSET_URL_PREFIX.length,
    boundaryIndexes.length ? Math.min(...boundaryIndexes) : undefined
  );
}

function unsafeRelativeAssetPath(relativeAssetPath: string) {
  if (!relativeAssetPath || /[\0\\%]/.test(relativeAssetPath)) return true;
  if (
    path.posix.isAbsolute(relativeAssetPath) ||
    path.win32.isAbsolute(relativeAssetPath) ||
    /^[A-Za-z]:/.test(relativeAssetPath)
  ) {
    return true;
  }
  return relativeAssetPath
    .split("/")
    .some((segment) => segment === "" || segment === "." || segment === "..");
}

function catalogFloorPlanPreviewAssetRelativePath(previewUrl: string) {
  if (!previewUrl.startsWith(PREVIEW_ASSET_URL_PREFIX)) return null;
  const pathname = previewAssetPathname(previewUrl);
  if (!pathname || pathname.includes("\0") || pathname.includes("\\")) return null;

  let relativeAssetPath: string;
  try {
    relativeAssetPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (unsafeRelativeAssetPath(relativeAssetPath)) return null;

  return relativeAssetPath;
}

export function resolveCatalogFloorPlanPreviewAssetPath(previewUrl: string) {
  const relativeAssetPath = catalogFloorPlanPreviewAssetRelativePath(previewUrl);
  if (!relativeAssetPath) return null;
  const candidate = path.join(
    process.cwd(),
    "public",
    "assets",
    relativeAssetPath
  );
  return containedAssetPath(FLOOR_PLAN_PREVIEW_ASSET_ROOT, candidate) ? candidate : null;
}

export function readCatalogFloorPlanPreviewAsset(previewUrl: string) {
  const relativeAssetPath = catalogFloorPlanPreviewAssetRelativePath(previewUrl);
  if (!relativeAssetPath) return null;
  const candidate = path.join(
    process.cwd(),
    "public",
    "assets",
    relativeAssetPath
  );
  if (!containedAssetPath(FLOOR_PLAN_PREVIEW_ASSET_ROOT, candidate)) return null;
  if (!fs.existsSync(candidate)) return null;
  const realRoot = fs.realpathSync(path.join(process.cwd(), "public", "assets"));
  if (realRoot !== FLOOR_PLAN_PREVIEW_ASSET_ROOT) return null;
  const realCandidate = fs.realpathSync(candidate);
  if (!containedAssetPath(realRoot, realCandidate)) return null;

  let descriptor: number;
  try {
    descriptor = fs.openSync(
      candidate,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") return null;
    throw error;
  }
  try {
    const openedIdentity = fs.fstatSync(descriptor, { bigint: true });
    const openedRealCandidate = fs.realpathSync(candidate);
    if (!containedAssetPath(realRoot, openedRealCandidate)) return null;
    const validatedIdentity = fs.statSync(openedRealCandidate, { bigint: true });
    if (
      openedIdentity.dev !== validatedIdentity.dev ||
      openedIdentity.ino !== validatedIdentity.ino
    ) {
      return null;
    }
    return new Uint8Array(fs.readFileSync(descriptor));
  } finally {
    fs.closeSync(descriptor);
  }
}
