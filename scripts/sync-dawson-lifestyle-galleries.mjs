import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = "/Users/justus/Documents/Interior-AI/interior-ai";

const TARGETS = [
  {
    file: "catalog/furniture/sofas/dawson_3s/catalog.yaml",
    fabricUrl: "https://www.castlery.com/sg/products/dawson-3-seater-sofa",
    leatherUrl: "https://www.castlery.com/sg/products/dawson-leather-3-seater-sofa",
  },
  {
    file: "catalog/furniture/sofas/dawson_extended_sofa/catalog.yaml",
    fabricUrl: "https://www.castlery.com/sg/products/dawson-extended-sofa",
    leatherUrl: "https://www.castlery.com/sg/products/dawson-leather-extended-sofa",
  },
  {
    file: "catalog/furniture/sofas/dawson_pit_sectional/catalog.yaml",
    fabricUrl: "https://www.castlery.com/sg/products/dawson-pit-sectional-sofa",
    leatherUrl: "https://www.castlery.com/sg/products/dawson-leather-pit-sectional-sofa",
  },
  {
    file: "catalog/furniture/sofas/dawson_wide_chaise_sectional/catalog.yaml",
    fabricUrl: "https://www.castlery.com/sg/products/dawson-wide-chaise-sectional-sofa",
    leatherUrl: null,
  },
  {
    file: "catalog/furniture/sofas/dawson_ottoman/catalog.yaml",
    fabricUrl: "https://www.castlery.com/sg/products/dawson-ottoman",
    leatherUrl: "https://www.castlery.com/sg/products/dawson-leather-small-ottoman",
  },
  {
    file: "catalog/furniture/sofas/dawson_swivel_armchair/catalog.yaml",
    fabricUrl: "https://www.castlery.com/sg/products/dawson-swivel-armchair",
    leatherUrl: "https://www.castlery.com/sg/products/dawson-leather-swivel-armchair",
  },
];

const LEATHER_LABEL_BY_CODE = {
  cocoa_leather: "Cocoa",
  caramel_leather: "Caramel",
  warm_taupe_leather: "Warm Taupe",
  marche_ivory_leather: "Marche, Ivory",
  marche_graphite_leather: "Marche, Graphite",
  marche_cocoa_leather: "Marche, Cocoa",
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrl(url) {
  return String(url ?? "").replace(/^\s+|\s+$/g, "");
}

function toHighRes(url) {
  return normalizeUrl(url).replace(
    /\/image\/private\/[^/]+\//,
    "/image/private/w_1995,f_auto,q_auto,c_fit/"
  );
}

function getSkuFromThumbnail(url) {
  const match = normalizeUrl(url).match(/\/crusader\/variants\/([^/]+)\//i);
  return match?.[1] ?? "";
}

function parseVariants(yamlContent) {
  const variants = [];
  const blocks = yamlContent.match(/\n  - variant:[\s\S]*?(?=\n  - variant:|\nai_flags:|\n$)/g) ?? [];
  for (const block of blocks) {
    const codeMatch = block.match(/\n\s+upholstery_code:\s+"([^"]+)"/);
    const labelMatch = block.match(/\n\s+upholstery_label:\s+"([^"]+)"/);
    const thumbMatch = block.match(/\n\s+thumbnail_url:\s+"([^"]+)"/);
    if (!codeMatch || !labelMatch || !thumbMatch) continue;
    variants.push({
      upholsteryCode: codeMatch[1],
      upholsteryLabel: labelMatch[1],
      thumbnailUrl: thumbMatch[1],
      block,
    });
  }
  return variants;
}

function withUpdatedGallery(block, galleryUrls) {
  const galleryYaml =
    "    gallery_images:\n" + galleryUrls.map((url) => `      - \"${url}\"`).join("\n") + "\n";

  if (/\n\s+gallery_images:\n(?:\s+- \".*\"\n)+/m.test(block)) {
    return block.replace(/\n\s+gallery_images:\n(?:\s+- \".*\"\n)+/m, `\n${galleryYaml}`);
  }

  return block.replace(
    /(\n\s+thumbnail_url:\s+"[^"]+"\n)/,
    `$1${galleryYaml}`
  );
}

async function clickSwatchByCandidates(page, candidates) {
  for (const candidate of candidates) {
    const clean = String(candidate ?? "").trim();
    if (!clean) continue;

    const exact = page.getByRole("button", {
      name: new RegExp(`^Select\\s+${escapeRegExp(clean)}$`, "i"),
    });
    if ((await exact.count()) > 0) {
      await exact.first().click({ force: true });
      await page.waitForTimeout(1800);
      return clean;
    }

    const fuzzy = page.getByRole("button", {
      name: new RegExp(`Select\\s+.*${escapeRegExp(clean)}.*`, "i"),
    });
    if ((await fuzzy.count()) > 0) {
      await fuzzy.first().click({ force: true });
      await page.waitForTimeout(1800);
      return clean;
    }
  }
  return null;
}

async function captureGallery(page) {
  const images = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("img"))
      .map((img) => {
        const rect = img.getBoundingClientRect();
        return {
          alt: (img.getAttribute("alt") || "").trim(),
          src: (img.currentSrc || img.getAttribute("src") || "").trim(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((entry) => entry.width > 400 && entry.height > 220 && entry.src);

    const hero = all.find((entry) => /(?:\simage\s0|\s0)$/i.test(entry.alt));
    if (!hero) return [];

    const prefix = hero.alt.replace(/(?:\simage\s0|\s0)$/i, "").trim();
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escapedPrefix}(?:\\simage\\s0|\\s0|\\s\\d+)$`, "i");

    const urls = [];
    for (const entry of all) {
      if (!pattern.test(entry.alt)) continue;
      if (/video\/private/i.test(entry.src)) continue;
      if (/AR-prompt/i.test(entry.src)) continue;
      if (!/res\.cloudinary\.com/i.test(entry.src)) continue;
      if (!urls.includes(entry.src)) {
        urls.push(entry.src);
      }
    }
    return urls;
  });

  return images.map(toHighRes);
}

function isLeatherVariant(code) {
  return /_leather$/.test(code) || ["cocoa_leather", "caramel_leather", "warm_taupe_leather"].includes(code);
}

function buildCandidates(variant) {
  const raw = [];
  raw.push(variant.upholsteryLabel);
  raw.push(variant.upholsteryLabel.replace(/^Marche Leather,\s*/i, "Marche, "));
  raw.push(variant.upholsteryLabel.replace(/\s*\(Leather\)\s*/i, ""));
  raw.push(LEATHER_LABEL_BY_CODE[variant.upholsteryCode] ?? "");

  const variantTail = variant.block.match(/\n\s+- variant:\s+"[^"]+\/\s*([^"]+)"/i)?.[1] ?? "";
  raw.push(variantTail);

  return Array.from(new Set(raw.map((v) => String(v ?? "").trim()).filter(Boolean)));
}

async function processTarget(browser, target) {
  const filePath = path.join(ROOT, target.file);
  const original = fs.readFileSync(filePath, "utf8");
  const variants = parseVariants(original);

  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await context.newPage();

  let updatedContent = original;
  let successCount = 0;
  const failures = [];

  for (const variant of variants) {
    const leather = isLeatherVariant(variant.upholsteryCode);
    const baseUrl = leather ? target.leatherUrl : target.fabricUrl;
    if (!baseUrl) {
      failures.push(`${variant.upholsteryCode}: no source page`);
      continue;
    }

    const variantUrl = `${baseUrl}?material=${encodeURIComponent(variant.upholsteryCode)}`;
    await page.goto(variantUrl, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(1800);

    const candidates = buildCandidates(variant);
    await clickSwatchByCandidates(page, candidates);

    let gallery = await captureGallery(page);
    const sku = getSkuFromThumbnail(variant.thumbnailUrl);

    if (gallery.length < 4 && sku) {
      const bySku = gallery.filter((url) => url.includes(`/variants/${sku}/`));
      if (bySku.length >= 4) {
        gallery = bySku;
      }
    }

    if (gallery.length < 2) {
      failures.push(`${variant.upholsteryCode}: only ${gallery.length} gallery images`);
      continue;
    }

    const unique = Array.from(new Set(gallery));
    const nextBlock = withUpdatedGallery(variant.block, unique);
    updatedContent = updatedContent.replace(variant.block, nextBlock);
    successCount += 1;

    console.log(`${target.file} | ${variant.upholsteryCode} -> ${unique.length} images`);
  }

  await context.close();

  if (updatedContent !== original) {
    fs.writeFileSync(filePath, updatedContent);
  }

  return { successCount, total: variants.length, failures };
}

const browser = await chromium.launch({ headless: true });

for (const target of TARGETS) {
  console.log(`\n=== ${target.file} ===`);
  const result = await processTarget(browser, target);
  console.log(`Updated ${result.successCount}/${result.total} variants`);
  if (result.failures.length > 0) {
    console.log("Failures:");
    for (const failure of result.failures.slice(0, 50)) {
      console.log(`  - ${failure}`);
    }
  }
}

await browser.close();
