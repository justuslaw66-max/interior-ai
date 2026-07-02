import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = "/Users/justus/Documents/Interior-AI/interior-ai";
const CLOUDINARY_BASE = "https://res.cloudinary.com/castlery/image/private";

const TARGETS = [
  {
    file: "catalog/furniture/sofas/madison_2s/catalog.yaml",
    kind: "2s",
    fabricUrl: "https://www.castlery.com/sg/products/madison-2-seater-sofa",
    leatherUrl: "https://www.castlery.com/sg/products/madison-leather-2-seater-sofa",
  },
  {
    file: "catalog/furniture/sofas/madison_3s/catalog.yaml",
    kind: "3s",
    fabricUrl: "https://www.castlery.com/sg/products/madison-3-seater-sofa",
    leatherUrl: "https://www.castlery.com/sg/products/madison-leather-3-seater-sofa",
  },
  {
    file: "catalog/furniture/sofas/madison_ottoman/catalog.yaml",
    kind: "ottoman",
    fabricUrl: "https://www.castlery.com/sg/products/madison-ottoman",
    leatherUrl: "https://www.castlery.com/sg/products/madison-leather-ottoman",
  },
];

const FABRIC_PARAM_BY_FINISH = {
  bisque_fabric: "bisque",
  stone_fabric: "stone",
  camille_forest_fabric: "camille_forest",
};

const EXPECTED_TOKENS_BY_FINISH = {
  bisque_fabric: ["bisque", "amalfi-bisque"],
  stone_fabric: ["stone"],
  camille_forest_fabric: ["forest"],
  caramel_leather: ["caramel"],
};

function normalizeUrl(url) {
  return String(url ?? "").trim();
}

function toThumb(url) {
  return normalizeUrl(url).replace(/\/image\/private\/[^/]+\//, "/image/private/w_560,f_auto,q_auto,c_fit/");
}

function toHighRes(url) {
  return normalizeUrl(url).replace(/\/image\/private\/[^/]+\//, "/image/private/w_1995,f_auto,q_auto,c_fit/");
}

function getFileName(url) {
  const clean = normalizeUrl(url).split("?")[0];
  const parts = clean.split("/");
  return parts[parts.length - 1] ?? "";
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseVariants(yamlContent) {
  const variants = [];
  const blocks = yamlContent.match(/\n  - variant:[\s\S]*?(?=\n  - variant:|\nai_flags:|\n$)/g) ?? [];
  for (const block of blocks) {
    const finishCodeMatch = block.match(/\n\s+finish_code:\s+"([^"]+)"/);
    const finishLabelMatch = block.match(/\n\s+finish_label:\s+"([^"]+)"/);
    const variantMatch = block.match(/\n\s+- variant:\s+"([^"]+)"/);
    if (!finishCodeMatch || !finishLabelMatch || !variantMatch) continue;
    variants.push({
      finishCode: finishCodeMatch[1],
      finishLabel: finishLabelMatch[1],
      variantLabel: variantMatch[1],
      block,
    });
  }
  return variants;
}

function withUpdatedMedia(block, thumbnailUrl, galleryUrls) {
  let next = block;
  if (/\n\s+thumbnail_url:\s+"[^"]+"/.test(next)) {
    next = next.replace(/\n\s+thumbnail_url:\s+"[^"]+"/, `\n    thumbnail_url: "${thumbnailUrl}"`);
  } else {
    next = next.replace(/(\n\s+finish_label:\s+"[^"]+"\n)/, `$1    thumbnail_url: "${thumbnailUrl}"\n`);
  }

  const galleryYaml = `    gallery_images:\n${galleryUrls.map((url) => `      - "${url}"`).join("\n")}\n`;
  if (/\n\s+gallery_images:\n(?:\s+- ".*"\n)+/m.test(next)) {
    next = next.replace(/\n\s+gallery_images:\n(?:\s+- ".*"\n)+/m, `\n${galleryYaml}`);
  } else {
    next = next.replace(/(\n\s+thumbnail_url:\s+"[^"]+"\n)/, `$1${galleryYaml}`);
  }

  return next;
}

function sortByMediaPriority(urls) {
  const score = (url) => {
    const name = getFileName(url).toLowerCase();
    if (/front/.test(name)) return 0;
    if (/lifestyle|square-set|set_/.test(name)) return 1;
    if (/angle/.test(name)) return 2;
    if (/side/.test(name)) return 3;
    if (/back/.test(name)) return 4;
    if (/det/.test(name)) return 5;
    if (/dim/.test(name)) return 6;
    return 7;
  };
  return [...urls].sort((left, right) => score(left) - score(right) || left.localeCompare(right));
}

function matchesExpectedFinish(url, finishCode) {
  const lower = getFileName(url).toLowerCase();
  return (EXPECTED_TOKENS_BY_FINISH[finishCode] ?? []).some((token) => lower.includes(token));
}

function filterImagesForTarget(urls, target) {
  const filtered = [];
  for (const url of urls) {
    const name = getFileName(url);
    if (!/Madison/i.test(name)) continue;
    if (/Owen/i.test(name)) continue;

    if (target.kind === "2s") {
      if (/Madison-(?:Leather-)?2-Seater-Sofa/i.test(name) || /Madison-Sofa-Collection/i.test(name) || /With-Ottoman/i.test(name) || /With-Armchair/i.test(name)) {
        filtered.push(url);
      }
      continue;
    }

    if (target.kind === "3s") {
      if (/Madison-(?:Leather-)?3-Seater-Sofa/i.test(name) || /Madison-Sofa-Collection/i.test(name) || /With-Ottoman/i.test(name) || /With-Armchair/i.test(name)) {
        filtered.push(url);
      }
      continue;
    }

    if (/Madison-Ottoman/i.test(name) || /With-Ottoman/i.test(name)) {
      filtered.push(url);
    }
  }
  return unique(filtered);
}

async function captureGallery(page) {
  const groups = await page.evaluate(() => {
    const entries = Array.from(document.querySelectorAll("img"))
      .map((img) => {
        const rect = img.getBoundingClientRect();
        return {
          alt: (img.getAttribute("alt") || "").trim(),
          src: (img.currentSrc || img.getAttribute("src") || "").trim(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((entry) => entry.width > 300 && entry.height > 180 && entry.src && /res\.cloudinary\.com/i.test(entry.src) && !/video\/private/i.test(entry.src));

    const map = new Map();
    for (const entry of entries) {
      const prefix = entry.alt.replace(/(?:\simage\s\d+|\s\d+)$/i, "").trim();
      if (!prefix) continue;
      const list = map.get(prefix) || [];
      list.push(entry.src);
      map.set(prefix, list);
    }

    return Array.from(map.entries())
      .filter(([prefix]) => /Madison/i.test(prefix))
      .map(([prefix, urls]) => ({ prefix, urls }));
  });

  const best = groups.sort((left, right) => right.urls.length - left.urls.length)[0];
  return best ? unique(best.urls.map(toHighRes)) : [];
}

async function urlExists(url) {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
}

async function getTwoSeatStoneFallback() {
  const candidateSkus = ["50441008-TW4002", "50440750-TW4002", "50440728-TW4002"];
  const candidateNames = [
    "Madison-2-Seater-Sofa-Stone-Front.jpg",
    "Madison-2-Seater-Sofa-Stone-Front.png",
    "Madison-2-Seater-Sofa-Stone-Lifestyle-Crop.jpg",
    "Madison-2-Seater-Sofa-Stone-Angle.jpg",
    "Madison-2-Seater-Sofa-Stone-Angle.png",
    "Madison-2-Seater-Sofa-Stone-Side.jpg",
    "Madison-2-Seater-Sofa-Stone-Side.png",
    "Madison-2-Seater-Sofa-Stone-Back.jpg",
    "Madison-2-Seater-Sofa-Stone-Back.png",
    "Madison-2-Seater-Sofa-Stone-Square-Set_1.jpg",
    "Madison-2-Seater-Sofa-Stone-Square-Set_2.jpg",
    "Madison-2-Seater-Sofa-Stone-Square-Det_1.jpg",
    "Madison-2-Seater-Sofa-Stone-Square-Det_2.jpg",
  ];
  const candidates = candidateSkus.flatMap((sku) =>
    candidateNames.map((name) => `${CLOUDINARY_BASE}/w_1995,f_auto,q_auto,c_fit/crusader/variants/${sku}/${name}`)
  );

  const found = [];
  for (const candidate of candidates) {
    if (await urlExists(candidate)) {
      found.push(candidate);
    }
  }
  return sortByMediaPriority(found);
}

async function collectVariantImages(page, target, variant) {
  const isLeather = variant.finishCode === "caramel_leather";
  const materialParam = FABRIC_PARAM_BY_FINISH[variant.finishCode];
  const pageUrl = isLeather
    ? target.leatherUrl
    : `${target.fabricUrl}?material=${encodeURIComponent(materialParam ?? "")}`;

  await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1800);

  let images = filterImagesForTarget(await captureGallery(page), target);
  if (!images.some((url) => matchesExpectedFinish(url, variant.finishCode))) {
    images = [];
  }

  if (target.kind === "2s" && variant.finishCode === "stone_fabric" && images.length < 2) {
    images = await getTwoSeatStoneFallback();
  }

  const finishMatched = images.filter((url) => matchesExpectedFinish(url, variant.finishCode));
  const finalImages = finishMatched.length > 0 ? finishMatched : images;
  return sortByMediaPriority(unique(finalImages));
}

async function processTarget(browser, target) {
  const filePath = path.join(ROOT, target.file);
  const original = fs.readFileSync(filePath, "utf8");
  const variants = parseVariants(original);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();

  let updated = original;
  let updatedCount = 0;
  const failures = [];

  for (const variant of variants) {
    const images = await collectVariantImages(page, target, variant);
    if (images.length < 2) {
      failures.push(`${variant.finishCode}: only ${images.length} official images`);
      continue;
    }

    const thumbnailUrl = toThumb(images[0]);
    const galleryUrls = images.slice(0, 6).map(toHighRes);
    const nextBlock = withUpdatedMedia(variant.block, thumbnailUrl, galleryUrls);
    updated = updated.replace(variant.block, nextBlock);
    updatedCount += 1;
    console.log(`${target.file} | ${variant.finishCode} -> ${galleryUrls.length} images`);
  }

  await context.close();

  if (updated !== original) {
    fs.writeFileSync(filePath, updated);
  }

  return { updatedCount, total: variants.length, failures };
}

const browser = await chromium.launch({ headless: true });

for (const target of TARGETS) {
  console.log(`\n=== ${target.file} ===`);
  const result = await processTarget(browser, target);
  console.log(`Updated ${result.updatedCount}/${result.total} variants`);
  if (result.failures.length > 0) {
    console.log("Failures:");
    for (const failure of result.failures) {
      console.log(`  - ${failure}`);
    }
  }
}

await browser.close();