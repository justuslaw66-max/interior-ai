import { CONDO_FILE_NAME, CONDO_SLUG } from "./condo-map-data";

/**
 * Which of the condo map's files the admin data route serves: `<slug>/map.json`, `<slug>/plans/<picture>` and
 * `<slug>/models/<model>.glb`, by plain names only, so a request can't reach anything else under the app.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  glb: "model/gltf-binary",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  png: "image/png",
  webp: "image/webp",
};

const FOLDER_TYPES: Readonly<Record<string, readonly string[]>> = {
  plans: ["png", "jpg", "jpeg", "webp"],
  models: ["glb"],
};

export type CondoMapFilePath = { segments: string[]; contentType: string };

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function condoMapFilePath(segments: readonly string[]): CondoMapFilePath | null {
  const [slug, ...rest] = segments;
  if (!slug || !CONDO_SLUG.test(slug)) return null;
  if (rest.length === 1 && rest[0] === "map.json") return { segments: [slug, "map.json"], contentType: CONTENT_TYPES.json };
  if (rest.length !== 2) return null;
  const [folder, name] = rest;
  const allowed = FOLDER_TYPES[folder];
  const type = extension(name);
  if (!allowed || !CONDO_FILE_NAME.test(name) || name.includes("..") || !allowed.includes(type)) return null;
  return { segments: [slug, folder, name], contentType: CONTENT_TYPES[type] };
}
