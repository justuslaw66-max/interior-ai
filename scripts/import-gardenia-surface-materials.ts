import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import type { SurfaceMaterial, SurfacePatternLayout } from "../lib/surface-material-schema";

const CONFIG_URL = "https://www.realityremod.com/GARDENIA";
const COLLECTIONS_INDEX_URL = "https://www.gardenia.it/en/collections";
const IMPORT_DATE = "2026-07-04";
const TENANT_ID = "GARDENIA";
const GROUP_ID = "0";
const PAGE_SIZE = 100;

type GardeniaConfig = {
  catalogueAppEndpoint: string;
  productPageEndpoint?: string;
  tenantId: string;
  groupId: string;
  token: string;
};

type GardeniaTileItem = {
  tileNum: number;
  code: string;
  colorVar: string;
  groutSize: number;
  groutColor: number;
  availablePatterns?: string;
  link?: string;
  formatSize?: string;
  nominalFormatDescription?: string;
  isApproximate?: boolean;
  surfaceType?: "ENTRAMBE" | "PAVIMENTO" | "RIVESTIMENTO" | string;
};

type GardeniaTileGroup = {
  preview: string;
  description: string;
  manufCode: string;
  items: GardeniaTileItem[];
};

type GardeniaTypology = {
  id: string;
  description: string;
};

type GardeniaColorSpec = {
  name: string;
  imageUrl: string | null;
  rawAvailability: string | null;
  thicknessesByFormat: Map<string, number[]>;
};

type GardeniaCollectionSpec = {
  seriesCode: string;
  url: string;
  title: string | null;
  description: string | null;
  technology: string | null;
  thicknessesMm: number[];
  sizes: string[];
  colors: Map<string, GardeniaColorSpec>;
};

type ImportTarget = {
  category: "flooring" | "wall_tile";
  destination: "PAVIMENTO" | "RIVESTIMENTO";
  idPart: "flooring" | "wall-tile";
  catalogDir: "flooring" | "wall_tile";
  targetLabel: string;
};

type MaterialWrite = { material: SurfaceMaterial; filePath: string };

const TARGETS: ImportTarget[] = [
  {
    category: "flooring",
    destination: "PAVIMENTO",
    idPart: "flooring",
    catalogDir: "flooring",
    targetLabel: "floor",
  },
  {
    category: "wall_tile",
    destination: "RIVESTIMENTO",
    idPart: "wall-tile",
    catalogDir: "wall_tile",
    targetLabel: "wall",
  },
];

const TYPOLOGY_TO_EFFECT: Record<string, SurfaceMaterial["classification"]["design_effect"]> = {
  CEMENTO: "concrete",
  COLORE: "plain",
  GENERICO: "plain",
  LEGNO: "wood",
  MARMO: "marble",
  PIETRA: "stone",
};

const GARDENIA_PATTERN_LAYOUT_BY_ID: Record<string, SurfacePatternLayout> = {
  pieno_01: "straight",
  pieno_02: "brick",
  pieno_05: "vertical_brick",
  spina_01: "herringbone",
  sfals_random_1: "random_stagger",
  cplx: "straight",
};

function parseArgs() {
  const args = new Map<string, string | boolean>();
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    args.set(key, value ?? true);
  }
  return {
    dryRun: args.get("dry-run") === true,
    skipAssets: args.get("skip-assets") === true,
    skipProductPages: args.get("skip-product-pages") === true,
    keepStale: args.get("keep-stale") === true,
    clean: args.get("clean") === true,
    limit:
      typeof args.get("limit") === "string"
        ? Number.parseInt(String(args.get("limit")), 10)
        : null,
  };
}

function assertOk(response: Response, url: string) {
  if (!response.ok) {
    throw new Error(`Gardenia request failed ${response.status} ${response.statusText}: ${url}`);
  }
}

function queryString(params: Record<string, string | number | string[] | null | undefined>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(entry)}`);
      }
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join("&");
}

async function fetchGardeniaConfig(): Promise<GardeniaConfig> {
  const response = await fetch(CONFIG_URL);
  assertOk(response, CONFIG_URL);
  const html = await response.text();
  const configJson = html.match(/CONFIG\s*=\s*(\{[\s\S]*?\});/)?.[1];
  if (!configJson) {
    throw new Error("Could not find RealityRemod CONFIG in Gardenia configurator HTML.");
  }
  const config = JSON.parse(configJson) as GardeniaConfig;
  if (!config.token || !config.catalogueAppEndpoint) {
    throw new Error("Gardenia configurator CONFIG is missing token or catalogueAppEndpoint.");
  }
  return config;
}

function apiBase(config: GardeniaConfig) {
  return `${config.catalogueAppEndpoint}/api/app/${config.tenantId || TENANT_ID}/${
    config.groupId || GROUP_ID
  }`;
}

function authHeaders(config: GardeniaConfig) {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function fetchJson<T>(config: GardeniaConfig, pathName: string, params: Record<string, unknown>) {
  const normalizedParams = params as Record<string, string | number | string[] | null | undefined>;
  const url = `${apiBase(config)}/${pathName}?${queryString(normalizedParams)}`;
  const response = await fetch(url, { headers: authHeaders(config) });
  assertOk(response, url);
  return (await response.json()) as T;
}

async function fetchCollectionIndexLinks() {
  const response = await fetch(COLLECTIONS_INDEX_URL, {
    headers: { "User-Agent": "Mozilla/5.0 Interior-AI catalog import" },
  });
  assertOk(response, COLLECTIONS_INDEX_URL);
  const html = await response.text();
  const links = new Map<string, string>();
  for (const match of html.matchAll(/href=["']([^"']*collection\/[^"']+)["']/gi)) {
    const url = resolveGardeniaUrl(COLLECTIONS_INDEX_URL, decodeHtml(match[1]));
    if (!url) continue;
    const slug = url.split("/").filter(Boolean).at(-1);
    if (slug) links.set(slug, url);
  }
  return links;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&deg;/g, "deg")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetaContent(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<meta[^>]+(?:name|property)=["']${escapedName}["'][^>]+content=["']([^"']+)["']`, "i")
  );
  return match ? decodeHtml(match[1]).trim() : null;
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : null;
}

function extractCollectionValue(html: string, label: string) {
  const match = html.match(
    new RegExp(
      `<p[^>]*class=["'][^"']*collectionCapitol[^"']*["'][^>]*>\\s*${label}\\s*<\\/p>\\s*<h4[^>]*>([\\s\\S]*?)<\\/h4>`,
      "i"
    )
  );
  return match ? stripTags(match[1]) : null;
}

function parseThicknesses(text: string | null) {
  if (!text) return [];
  const values = new Set<number>();
  for (const match of text.matchAll(/([0-9]+(?:[,.][0-9]+)?)\s*mm/gi)) {
    values.add(Number.parseFloat(match[1].replace(",", ".")));
  }
  return Array.from(values).sort((a, b) => a - b);
}

function normalizeFormat(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/([0-9]+(?:[,.][0-9]+)?)\s*x\s*([0-9]+(?:[,.][0-9]+)?)/i);
  if (!match) return null;
  const formatNumber = (entry: string) =>
    Number.parseFloat(entry.replace(",", "."))
      .toString()
      .replace(/\.0$/, "");
  return `${formatNumber(match[1])}x${formatNumber(match[2])}`;
}

function parseFormats(text: string | null) {
  if (!text) return [];
  const values = new Set<string>();
  for (const match of text.matchAll(/([0-9]+(?:[,.][0-9]+)?)\s*x\s*([0-9]+(?:[,.][0-9]+)?)/gi)) {
    const normalized = normalizeFormat(`${match[1]}x${match[2]}`);
    if (normalized) values.add(normalized);
  }
  return Array.from(values);
}

function resolveGardeniaUrl(pageUrl: string, href: string | null) {
  if (!href) return null;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return null;
  }
}

function parseColorAvailability(rawTitle: string | null) {
  const thicknessesByFormat = new Map<string, number[]>();
  if (!rawTitle) return thicknessesByFormat;
  const plain = stripTags(rawTitle);
  for (const segment of plain.split("|")) {
    const match = segment.match(/([0-9]+(?:[,.][0-9]+)?)\s*mm\s*:\s*([\s\S]*)/i);
    if (!match) continue;
    const thickness = Number.parseFloat(match[1].replace(",", "."));
    for (const format of parseFormats(match[2])) {
      const existing = thicknessesByFormat.get(format) ?? [];
      if (!existing.includes(thickness)) existing.push(thickness);
      thicknessesByFormat.set(
        format,
        existing.sort((a, b) => a - b)
      );
    }
  }
  return thicknessesByFormat;
}

function parseCollectionSpec(seriesCode: string, pageUrl: string, html: string): GardeniaCollectionSpec {
  const technology = extractCollectionValue(html, "Technology");
  const thicknessText = extractCollectionValue(html, "Thickness");
  const sizeText = extractCollectionValue(html, "Size");
  const colors = new Map<string, GardeniaColorSpec>();
  const colorRegex =
    /<a[^>]+class=["'][^"']*lightcaseHover[^"']*["'][^>]+href=["']([^"']+)["'][^>]+title=(["'])([\s\S]*?)\2[\s\S]*?<img[^>]+alt=["']([^"']+)["']/gi;

  for (const match of html.matchAll(colorRegex)) {
    const imageUrl = resolveGardeniaUrl(pageUrl, decodeHtml(match[1]));
    const rawAvailability = stripTags(match[3]);
    const name = decodeHtml(match[4]).trim();
    colors.set(slugify(name), {
      name,
      imageUrl,
      rawAvailability,
      thicknessesByFormat: parseColorAvailability(rawAvailability),
    });
  }

  return {
    seriesCode,
    url: pageUrl,
    title: extractTitle(html),
    description: extractMetaContent(html, "Description") ?? extractMetaContent(html, "og:description"),
    technology,
    thicknessesMm: parseThicknesses(thicknessText),
    sizes: parseFormats(sizeText),
    colors,
  };
}

async function fetchCollectionSpecs(seriesCodes: string[], collectionLinks: Map<string, string>) {
  const result = new Map<string, GardeniaCollectionSpec>();
  for (const seriesCode of seriesCodes) {
    const seriesSlug = slugify(seriesCode);
    const url = collectionLinks.get(seriesSlug) ?? `https://www.gardenia.it/en/collection/${seriesSlug}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 Interior-AI catalog import" },
    });
    if (!response.ok) {
      console.warn(`Skipping Gardenia collection page ${url}: ${response.status} ${response.statusText}`);
      continue;
    }
    const html = await response.text();
    result.set(seriesCode, parseCollectionSpec(seriesCode, url, html));
  }
  return result;
}

async function fetchAllTileGroups(config: GardeniaConfig, limit: number | null) {
  const groups: GardeniaTileGroup[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const page = await fetchJson<GardeniaTileGroup[]>(config, "tilegroups/v1", {
      start,
      count: PAGE_SIZE,
      lang: "en",
      surfaceType: ["ENTRAMBE", "PAVIMENTO", "RIVESTIMENTO"],
    });
    groups.push(...page);
    if (limit !== null && groups.length >= limit) return groups.slice(0, limit);
    if (page.length < PAGE_SIZE) return groups;
  }
}

async function fetchSeriesTypologies(config: GardeniaConfig, seriesCodes: string[]) {
  const result = new Map<string, GardeniaTypology[]>();
  for (const series of seriesCodes) {
    const typologies = await fetchJson<GardeniaTypology[]>(config, "tilegroups/typologies", {
      lang: "en",
      surfaceType: ["ENTRAMBE", "PAVIMENTO", "RIVESTIMENTO"],
      series: [series],
    });
    result.set(series, typologies);
  }
  return result;
}

function splitPreviewPath(preview: string) {
  return preview.split(/[\\/]+/).filter(Boolean);
}

function getSeriesCode(group: GardeniaTileGroup) {
  return splitPreviewPath(group.preview)[1] ?? "GARDENIA";
}

function getPreviewCode(group: GardeniaTileGroup) {
  const filename = splitPreviewPath(group.preview).at(-1) ?? group.items[0]?.code ?? "tile";
  return filename.replace(/\.[^.]+$/, "");
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/([\s-/]+)/)
    .map((part) => {
      if (!/[a-z]/.test(part)) return part;
      if (part === "3d") return "3D";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

function supportsTarget(item: GardeniaTileItem, target: ImportTarget) {
  return item.surfaceType === "ENTRAMBE" || item.surfaceType === target.destination;
}

function parseTileSize(item: GardeniaTileItem | null | undefined) {
  if (!item) return null;
  const exact = item.formatSize?.match(/([0-9]+(?:[.,][0-9]+)?)\s*x\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (exact) {
    return {
      widthMm: Number.parseFloat(exact[1].replace(",", ".")),
      lengthMm: Number.parseFloat(exact[2].replace(",", ".")),
    };
  }
  const nominal = item.nominalFormatDescription?.match(
    /([0-9]+(?:[.,][0-9]+)?)\s*x\s*([0-9]+(?:[.,][0-9]+)?)/i
  );
  if (nominal) {
    return {
      widthMm: Number.parseFloat(nominal[1].replace(",", ".")) * 10,
      lengthMm: Number.parseFloat(nominal[2].replace(",", ".")) * 10,
    };
  }
  return null;
}

function colorFamilyFromDescription(description: string): SurfaceMaterial["classification"]["color_family"] {
  const value = description.toLowerCase();
  if (/\b(white|bianco|latte|calce)\b/.test(value)) return "white";
  if (/\b(black|nero)\b/.test(value)) return "black";
  if (/\b(charcoal|antracite|graphite|grafite|dark|scuro)\b/.test(value)) return "charcoal";
  if (/\b(grey|gray|grigio|silver|argento)\b/.test(value)) return "grey";
  if (/\b(walnut|noce)\b/.test(value)) return "walnut";
  if (/\b(brown|moka|cotto|terra|fango|tobacco|tabacco)\b/.test(value)) return "brown";
  if (/\b(beige|sand|sabbia|taupe|tortora|avorio|ivory)\b/.test(value)) return "beige";
  if (/\b(cream|crema|bone)\b/.test(value)) return "cream";
  if (/\b(oak|rovere|natural|naturale)\b/.test(value)) return "natural_oak";
  if (/\b(mix|multicolor|decor|dec\.|blu|blue|green|verde|red|rosso|yellow|giallo)\b/.test(value)) {
    return "mixed";
  }
  return "unknown";
}

function typologyToEffect(typologies: GardeniaTypology[] | undefined) {
  const firstKnown = typologies?.find((typology) => TYPOLOGY_TO_EFFECT[typology.id]);
  return firstKnown ? TYPOLOGY_TO_EFFECT[firstKnown.id] : "unknown";
}

function buildTone(
  effect: SurfaceMaterial["classification"]["design_effect"],
  color: SurfaceMaterial["classification"]["color_family"]
) {
  const tones = new Set<SurfaceMaterial["classification"]["tone"][number]>([
    "neutral",
    "durable",
    "clean",
  ]);
  if (effect === "wood" || effect === "stone" || effect === "marble") tones.add("natural");
  if (color === "beige" || color === "cream" || color === "light_oak") tones.add("warm");
  if (color === "grey" || color === "charcoal" || color === "black") tones.add("cool");
  if (effect !== "plain") tones.add("textured");
  return Array.from(tones);
}

function buildStyleCluster(effect: SurfaceMaterial["classification"]["design_effect"]) {
  const clusters = new Set<SurfaceMaterial["classification"]["style_cluster"][number]>([
    "contemporary",
    "modern",
    "hospitality",
  ]);
  if (effect === "wood" || effect === "stone") clusters.add("japandi");
  if (effect === "marble" || effect === "stone") clusters.add("commercial");
  return Array.from(clusters);
}

function buildRoomSuitability(target: ImportTarget) {
  if (target.category === "wall_tile") {
    return ["kitchen", "bathroom", "living_room", "commercial", "hospitality"];
  }
  return ["living_room", "dining_room", "kitchen", "bathroom", "hallway", "commercial", "hospitality"];
}

function findColorSpec(collectionSpec: GardeniaCollectionSpec | undefined, description: string) {
  if (!collectionSpec) return null;
  return collectionSpec.colors.get(slugify(description)) ?? null;
}

function getItemFormatLabel(item: GardeniaTileItem) {
  return item.nominalFormatDescription || item.formatSize || `${item.tileNum}`;
}

function getItemFormatSlug(item: GardeniaTileItem) {
  return slugify(getItemFormatLabel(item));
}

function parseGardeniaPatternIds(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mapGardeniaPatternLayouts(value: string | null | undefined): SurfacePatternLayout[] {
  const layouts: SurfacePatternLayout[] = [];
  for (const patternId of parseGardeniaPatternIds(value)) {
    const layout = GARDENIA_PATTERN_LAYOUT_BY_ID[patternId.toLowerCase()];
    if (!layout || layouts.includes(layout)) continue;
    layouts.push(layout);
  }
  return layouts.length > 0 ? layouts : parseGardeniaPatternIds(value).length > 0 ? ["straight"] : [];
}

function resolveTotalThicknessMm(
  item: GardeniaTileItem,
  collectionSpec: GardeniaCollectionSpec | undefined,
  colorSpec: GardeniaColorSpec | null
) {
  const format = normalizeFormat(item.nominalFormatDescription ?? item.formatSize);
  if (format && colorSpec) {
    const matchingThicknesses = colorSpec.thicknessesByFormat.get(format) ?? [];
    if (matchingThicknesses.length === 1) return matchingThicknesses[0];
  }
  if (collectionSpec?.thicknessesMm.length === 1) return collectionSpec.thicknessesMm[0];
  return null;
}

function buildSourceNotes(
  group: GardeniaTileGroup,
  target: ImportTarget,
  item: GardeniaTileItem,
  collectionSpec: GardeniaCollectionSpec | undefined,
  colorSpec: GardeniaColorSpec | null
) {
  const sizeNotes = group.items
    .map((item) => {
      const size = item.nominalFormatDescription || item.formatSize || "unknown size";
      const patternIds = parseGardeniaPatternIds(item.availablePatterns).join(",") || "unknown patterns";
      return `${item.code} ${size} ${item.surfaceType ?? "unknown surface"} patterns ${patternIds}`;
    })
    .filter((value, index, values) => values.indexOf(value) === index)
    .join("; ");

  return [
    `Imported from Gardenia RealityRemod configurator with user-confirmed permission on ${IMPORT_DATE}.`,
    `Gardenia tile item ${group.manufCode}/${item.code}/${item.colorVar}/${item.tileNum} for ${target.targetLabel} use.`,
    `Configurator format: ${getItemFormatLabel(item)}; surface destination: ${item.surfaceType ?? "unknown"}.`,
    ...(parseGardeniaPatternIds(item.availablePatterns).length
      ? [`Configurator pattern IDs: ${parseGardeniaPatternIds(item.availablePatterns).join(", ")}.`]
      : []),
    ...(collectionSpec?.technology ? [`Collection page technology: ${collectionSpec.technology}.`] : []),
    ...(collectionSpec?.description ? [`Collection page description: ${collectionSpec.description}.`] : []),
    ...(collectionSpec?.thicknessesMm.length
      ? [`Collection page thicknesses: ${collectionSpec.thicknessesMm.join(", ")} mm.`]
      : []),
    ...(collectionSpec?.sizes.length ? [`Collection page sizes: ${collectionSpec.sizes.join(", ")}.`] : []),
    ...(colorSpec?.rawAvailability
      ? [`Collection page color availability for ${colorSpec.name}: ${colorSpec.rawAvailability}.`]
      : []),
    `Available configurator formats: ${sizeNotes}.`,
    "The configurator API did not expose slip rating, package quantity, price, or seamless texture QA data.",
  ];
}

function buildMaterial(
  group: GardeniaTileGroup,
  item: GardeniaTileItem,
  target: ImportTarget,
  typologies: GardeniaTypology[] | undefined,
  collectionSpec: GardeniaCollectionSpec | undefined,
  assetUrl: string
): SurfaceMaterial {
  const seriesCode = getSeriesCode(group);
  const seriesSlug = slugify(seriesCode);
  const descriptionSlug = slugify(group.description || getPreviewCode(group));
  const size = parseTileSize(item);
  const colorSpec = findColorSpec(collectionSpec, group.description);
  const totalThicknessMm = resolveTotalThicknessMm(item, collectionSpec, colorSpec);
  const effect = typologyToEffect(typologies);
  const color = colorFamilyFromDescription(group.description);
  const itemFormatSlug = getItemFormatSlug(item);
  const itemCodeSlug = slugify(item.code);
  const itemColorSlug = slugify(item.colorVar);
  const materialId = `gardenia-${target.idPart}-${seriesSlug}-${descriptionSlug}-${itemCodeSlug}-${itemFormatSlug}-${item.tileNum}-${itemColorSlug}`;
  const collection = titleCase(seriesCode);
  const productName = `Gardenia ${collection} ${titleCase(group.description || getPreviewCode(group))} ${getItemFormatLabel(item)}`;
  const sourceUrl = collectionSpec?.url ?? item.link ?? "https://www.gardenia.it/en/configurator";
  const publishBlockers = [
    ...(!size || totalThicknessMm === null ? ["confirm_physical_dimensions"] : []),
    "confirm_texture_tileability",
    "confirm_price_per_sqm_or_quote_mode",
  ];

  return {
    schema_version: 1,
    surface_material: {
      supplier: "gardenia_orchidea",
      brand: "Gardenia Orchidea",
      collection,
      material_id: materialId,
      product_name: productName,
      slug: materialId,
      surface_category: target.category,
      material_family: "tile",
    },
    source: {
      supplier_region: "international",
      source_url: sourceUrl,
      sample_request_url: null,
      currency: "EUR",
      license_status: "confirmed",
      notes: buildSourceNotes(group, target, item, collectionSpec, colorSpec),
    },
    classification: {
      flooring_type: "tile",
      design_effect: effect,
      color_family: color,
      tone: buildTone(effect, color),
      style_cluster: buildStyleCluster(effect),
      room_suitability: buildRoomSuitability(target),
    },
    physical_specs: {
      plank_or_tile_format: "tile",
      plank_width_mm: null,
      plank_length_mm: null,
      tile_width_mm: size?.widthMm ?? null,
      tile_length_mm: size?.lengthMm ?? null,
      total_thickness_mm: totalThicknessMm,
      wear_layer_mm: null,
      installation_method: ["direct_stick"],
      waterproof: null,
      slip_rating: null,
      suitable_for_wet_area: null,
      suitable_for_outdoor: null,
      commercial_grade: null,
    },
    texture_assets: {
      swatch_url: assetUrl,
      base_color_url: assetUrl,
      normal_url: null,
      roughness_url: null,
      ao_url: null,
      preview_room_url: null,
      tileable: "needs_confirmation",
      texture_repeat_size_cm: size
        ? {
            width: Number((size.widthMm / 10).toFixed(3)),
            height: Number((size.lengthMm / 10).toFixed(3)),
          }
        : null,
    },
    rendering: {
      default_rotation_deg: 0,
      roughness: effect === "marble" ? 0.48 : 0.62,
      metalness: 0,
      normal_strength: 0.15,
      scale_mode: "physical_repeat",
      seam_strategy: "repeat_texture",
      source_pattern_ids: parseGardeniaPatternIds(item.availablePatterns),
      available_pattern_layouts: mapGardeniaPatternLayouts(item.availablePatterns),
    },
    commerce: {
      purchase_mode: "unknown",
      price_per_sqm: {
        currency: "EUR",
        amount: null,
      },
      sample_available: "unknown",
      sample_request_url: null,
      direct_checkout: false,
    },
    import_governance: {
      publish_status: "draft",
      publish_blockers: publishBlockers,
      qa_flags: [
        "gardenia_realityremod_import",
        "gardenia_tile_item_variant",
        "user_confirmed_permission",
        "configurator_preview_asset",
        ...(collectionSpec ? ["gardenia_collection_page_enriched"] : []),
        "surface_target_specific_entry",
      ],
    },
  };
}

function normalizeDedupeKeyPart(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "";
  }
  return String(value).trim().toLowerCase();
}

function getEquivalentGardeniaVariantKey(write: MaterialWrite) {
  const material = write.material;
  const specs = material.physical_specs;
  const assets = material.texture_assets;
  return [
    material.surface_material.supplier,
    material.surface_material.brand,
    material.surface_material.collection,
    material.surface_material.product_name,
    material.surface_material.surface_category,
    material.surface_material.material_family,
    material.classification.design_effect,
    material.classification.color_family,
    specs.tile_width_mm,
    specs.tile_length_mm,
    specs.total_thickness_mm,
    assets.swatch_url,
    assets.base_color_url,
    material.rendering.source_pattern_ids?.join(","),
    material.rendering.available_pattern_layouts?.join(","),
  ]
    .map(normalizeDedupeKeyPart)
    .join("|");
}

function getGardeniaSurfaceDestination(material: SurfaceMaterial) {
  const note = material.source.notes?.find((entry) => entry.includes("surface destination:"));
  return note?.match(/surface destination:\s*([^.;]+)/i)?.[1]?.trim() ?? null;
}

function getPreferredGardeniaDestination(material: SurfaceMaterial) {
  return material.surface_material.surface_category === "flooring" ? "PAVIMENTO" : "RIVESTIMENTO";
}

function compareEquivalentGardeniaWrites(a: MaterialWrite, b: MaterialWrite) {
  const aDestination = getGardeniaSurfaceDestination(a.material);
  const bDestination = getGardeniaSurfaceDestination(b.material);
  const preferred = getPreferredGardeniaDestination(a.material);
  const aPreferred = aDestination === preferred;
  const bPreferred = bDestination === preferred;
  if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
  return a.material.surface_material.material_id.localeCompare(b.material.surface_material.material_id);
}

function getGardeniaVariantReference(material: SurfaceMaterial) {
  const note = material.source.notes?.find((entry) => entry.startsWith("Gardenia tile item "));
  if (!note) return material.surface_material.material_id;
  return note
    .replace(/^Gardenia tile item\s+/i, "")
    .replace(/\s+for\s+.+$/i, "")
    .trim();
}

function appendUniqueValues(values: string[], additions: string[]) {
  return Array.from(new Set([...values, ...additions]));
}

function collapseEquivalentGardeniaVariants(writes: MaterialWrite[]) {
  const groups = new Map<string, MaterialWrite[]>();
  for (const write of writes) {
    const key = getEquivalentGardeniaVariantKey(write);
    groups.set(key, [...(groups.get(key) ?? []), write]);
  }

  const keptMaterialIds = new Set<string>();
  let collapsedCount = 0;

  for (const entries of groups.values()) {
    const [keeper, ...collapsed] = [...entries].sort(compareEquivalentGardeniaWrites);
    keptMaterialIds.add(keeper.material.surface_material.material_id);

    if (collapsed.length === 0) continue;
    collapsedCount += collapsed.length;
    const collapsedRefs = collapsed.map((write) => getGardeniaVariantReference(write.material));
    keeper.material.source.notes = appendUniqueValues(keeper.material.source.notes ?? [], [
      `Equivalent Gardenia configurator item codes represented by this visible variant: ${collapsedRefs.join(
        "; "
      )}.`,
    ]);
    keeper.material.import_governance.qa_flags = appendUniqueValues(
      keeper.material.import_governance.qa_flags,
      ["gardenia_equivalent_variant_collapsed"]
    );
  }

  return {
    materialWrites: writes.filter((write) => keptMaterialIds.has(write.material.surface_material.material_id)),
    collapsedCount,
  };
}

function yamlForMaterial(material: SurfaceMaterial) {
  return stringify(material, {
    lineWidth: 0,
    singleQuote: false,
  });
}

function assetRelativePath(group: GardeniaTileGroup) {
  const seriesSlug = slugify(getSeriesCode(group));
  const previewCode = slugify(getPreviewCode(group));
  return `/assets/catalog/surface-materials/gardenia/${seriesSlug}/${previewCode}.webp`;
}

function assetFilePath(group: GardeniaTileGroup) {
  return path.join(process.cwd(), "public", assetRelativePath(group));
}

async function downloadAsset(config: GardeniaConfig, group: GardeniaTileGroup) {
  const targetPath = assetFilePath(group);
  if (fs.existsSync(targetPath)) return false;

  const url = `${apiBase(config)}/tiles/thumbs?${queryString({
    thumbFilename: group.preview,
    width: 512,
    height: 512,
  })}`;
  const response = await fetch(url, { headers: authHeaders(config) });
  assertOk(response, url);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, bytes);
  return true;
}

function catalogFilePathForMaterial(material: SurfaceMaterial) {
  const category = material.surface_material.surface_category === "wall_tile" ? "wall_tile" : "flooring";
  const collectionSlug = slugify(material.surface_material.collection ?? "gardenia");
  return path.join(
    process.cwd(),
    "catalog",
    "surface-materials",
    category,
    "gardenia",
    collectionSlug,
    material.surface_material.slug,
    "catalog.yaml"
  );
}

function cleanGardeniaCatalogEntries() {
  const roots = [
    path.join(process.cwd(), "catalog", "surface-materials", "flooring", "gardenia"),
    path.join(process.cwd(), "catalog", "surface-materials", "wall_tile", "gardenia"),
  ];
  for (const root of roots) {
    if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  }
}

function cleanGardeniaAssets() {
  const root = path.join(process.cwd(), "public", "assets", "catalog", "surface-materials", "gardenia");
  if (fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
}

async function main() {
  const args = parseArgs();
  const config = await fetchGardeniaConfig();
  const groups = await fetchAllTileGroups(config, args.limit);
  const seriesCodes = Array.from(new Set(groups.map(getSeriesCode))).sort((a, b) =>
    a.localeCompare(b)
  );
  const seriesTypologies = await fetchSeriesTypologies(config, seriesCodes);
  const collectionLinks = args.skipProductPages ? new Map<string, string>() : await fetchCollectionIndexLinks();
  const collectionSpecs = args.skipProductPages
    ? new Map<string, GardeniaCollectionSpec>()
    : await fetchCollectionSpecs(seriesCodes, collectionLinks);
  const configuratorCollectionSlugs = new Set(seriesCodes.map(slugify));
  const indexCollectionsNotInConfigurator = [...collectionLinks.keys()]
    .filter((slug) => !configuratorCollectionSlugs.has(slug))
    .sort((a, b) => a.localeCompare(b));
  const rawMaterialWrites: MaterialWrite[] = [];
  let assetDownloads = 0;

  if (!args.dryRun) {
    if (!args.keepStale) cleanGardeniaCatalogEntries();
    if (args.clean) cleanGardeniaAssets();
  }

  for (const group of groups) {
    if (!args.skipAssets && !args.dryRun) {
      if (await downloadAsset(config, group)) assetDownloads += 1;
    }

    const assetUrl = assetRelativePath(group);
    const typologies = seriesTypologies.get(getSeriesCode(group));
    const collectionSpec = collectionSpecs.get(getSeriesCode(group));
    for (const target of TARGETS) {
      for (const item of group.items) {
        if (!supportsTarget(item, target)) continue;
        const material = buildMaterial(group, item, target, typologies, collectionSpec, assetUrl);
        rawMaterialWrites.push({
          material,
          filePath: catalogFilePathForMaterial(material),
        });
      }
    }
  }

  const { materialWrites, collapsedCount } = collapseEquivalentGardeniaVariants(rawMaterialWrites);

  if (!args.dryRun) {
    for (const write of materialWrites) {
      fs.mkdirSync(path.dirname(write.filePath), { recursive: true });
      fs.writeFileSync(write.filePath, yamlForMaterial(write.material));
    }
  }

  const counts = materialWrites.reduce<Record<string, number>>((acc, write) => {
    const category = write.material.surface_material.surface_category;
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  console.log(
    [
      `Gardenia tile groups: ${groups.length}`,
      `Gardenia tile item target variants: ${rawMaterialWrites.length}`,
      `Equivalent visible variants collapsed: ${collapsedCount}`,
      `Gardenia surface materials: ${materialWrites.length}`,
      `Gardenia collection index links: ${collectionLinks.size}`,
      `Collection pages enriched: ${collectionSpecs.size}`,
      `Index collections not in configurator import: ${indexCollectionsNotInConfigurator.join(", ") || "none"}`,
      `By category: ${JSON.stringify(counts)}`,
      `Assets downloaded: ${assetDownloads}`,
      args.dryRun ? "Dry run only; no files written." : "Import complete.",
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
