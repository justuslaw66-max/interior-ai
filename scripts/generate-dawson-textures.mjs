import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "incoming", "dawson-reference", "originals");
const OUT_SWATCH = path.join(ROOT, "public", "swatches", "dawson");
const OUT_CLOSEUP = path.join(ROOT, "public", "materials", "dawson");
const OUT_BASE = path.join(ROOT, "public", "pbr", "dawson");
const OUT_FABRICS = path.join(ROOT, "public", "pbr", "fabrics");

const OPTIONS = [
  "navagio-seagull",
  "performance-creamy-white",
  "indigo-blue",
  "marcel-brilliant-white",
  "peyton-ivory",
  "peyton-dove-grey",
  "marcel-smoke-grey",
  "peyton-moss",
  "peyton-cumin",
  "infinity-boucle-ginger",
  "infinity-boucle-white-quartz",
];

const FAMILY_SOURCE = {
  "linen-slub-weave": "navagio-seagull",
  twill: "indigo-blue",
  "textured-plain-weave": "marcel-smoke-grey",
  "performance-fleece": "peyton-moss",
  "infinity-boucle": "infinity-boucle-ginger",
};

const OPTION_TO_FAMILY = {
  "navagio-seagull": "linen-slub-weave",
  "performance-creamy-white": "twill",
  "indigo-blue": "twill",
  "marcel-brilliant-white": "textured-plain-weave",
  "marcel-smoke-grey": "textured-plain-weave",
  "peyton-ivory": "performance-fleece",
  "peyton-dove-grey": "performance-fleece",
  "peyton-moss": "performance-fleece",
  "peyton-cumin": "performance-fleece",
  "infinity-boucle-ginger": "infinity-boucle",
  "infinity-boucle-white-quartz": "infinity-boucle",
};

const DEFAULT_TUNE = {
  cropBandRatio: 0.45,
  saturation: 1.02,
  brightness: 1.0,
  contrast: 1.0,
  offset: 0,
  normalStrength: 1.7,
  roughnessBase: 200,
  roughnessSlope: 0.28,
  roughnessMin: 150,
  roughnessMax: 240,
};

const FAMILY_TUNE = {
  "linen-slub-weave": {
    cropBandRatio: 0.44,
    saturation: 1.1,
    brightness: 0.9,
    contrast: 1.12,
    offset: -10,
    normalStrength: 2.8,
    roughnessBase: 206,
    roughnessSlope: 0.3,
    roughnessMin: 158,
    roughnessMax: 238,
  },
  twill: {
    cropBandRatio: 0.42,
    saturation: 1.18,
    brightness: 0.86,
    contrast: 1.16,
    offset: -14,
    normalStrength: 3.2,
    roughnessBase: 196,
    roughnessSlope: 0.26,
    roughnessMin: 145,
    roughnessMax: 232,
  },
  "textured-plain-weave": {
    cropBandRatio: 0.44,
    saturation: 1.1,
    brightness: 0.9,
    contrast: 1.14,
    offset: -10,
    normalStrength: 3.0,
    roughnessBase: 212,
    roughnessSlope: 0.32,
    roughnessMin: 164,
    roughnessMax: 242,
  },
  "performance-fleece": {
    cropBandRatio: 0.4,
    saturation: 1.08,
    brightness: 0.9,
    contrast: 1.08,
    offset: -8,
    normalStrength: 2.0,
    roughnessBase: 214,
    roughnessSlope: 0.2,
    roughnessMin: 178,
    roughnessMax: 244,
  },
  "infinity-boucle": {
    cropBandRatio: 0.42,
    saturation: 1.1,
    brightness: 0.88,
    contrast: 1.12,
    offset: -10,
    normalStrength: 2.7,
    roughnessBase: 213,
    roughnessSlope: 0.26,
    roughnessMin: 175,
    roughnessMax: 244,
  },
};

const OPTION_TUNE = {
  "indigo-blue": {
    saturation: 1.28,
    brightness: 0.74,
    contrast: 1.24,
    offset: -20,
  },
  "peyton-cumin": {
    saturation: 1.2,
    brightness: 0.78,
    contrast: 1.18,
    offset: -16,
  },
};

function getTuneForOption(option, family) {
  return {
    ...getTuneForFamily(family),
    ...(OPTION_TUNE[option] || {}),
  };
}

function getTuneForFamily(family) {
  return {
    ...DEFAULT_TUNE,
    ...(FAMILY_TUNE[family] || {}),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function ensureDirs() {
  await fs.mkdir(OUT_SWATCH, { recursive: true });
  await fs.mkdir(OUT_CLOSEUP, { recursive: true });
  await fs.mkdir(OUT_BASE, { recursive: true });
  await fs.mkdir(OUT_FABRICS, { recursive: true });

  for (const option of OPTIONS) {
    await fs.mkdir(path.join(OUT_BASE, option), { recursive: true });
  }

  for (const family of Object.keys(FAMILY_SOURCE)) {
    await fs.mkdir(path.join(OUT_FABRICS, family), { recursive: true });
  }
}

async function getTopTextureSquare(inputPath, cropBandRatio) {
  const img = sharp(inputPath);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Invalid image metadata: ${inputPath}`);
  }

  // The references have product text in the lower section; crop a top-only square.
  const textureBandHeight = Math.max(
    256,
    Math.floor(meta.height * clamp(cropBandRatio, 0.2, 0.8))
  );
  const square = Math.min(meta.width, textureBandHeight);
  const left = Math.floor((meta.width - square) / 2);

  return img.extract({ left, top: 0, width: square, height: square });
}

async function generateOptionAssets(option) {
  const family = OPTION_TO_FAMILY[option];
  const tune = getTuneForOption(option, family);
  const inputPath = path.join(SRC_DIR, `${option}.jpg`);
  const topSquare = await getTopTextureSquare(inputPath, tune.cropBandRatio);

  await topSquare
    .clone()
    .resize(512, 512, { fit: "cover" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUT_SWATCH, `${option}.jpg`));

  await topSquare
    .clone()
    .resize(1024, 1024, { fit: "cover" })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUT_CLOSEUP, `${option}-closeup.jpg`));

  // First-pass base color map from the same square crop.
  await topSquare
    .clone()
    .resize(1024, 1024, { fit: "cover" })
    .modulate({ saturation: tune.saturation, brightness: tune.brightness })
    .linear(tune.contrast, tune.offset)
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUT_BASE, option, "basecolor.jpg"));
}

function buildNormalMapFromRgb(rgb, width, height, strength = 1.7) {
  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < rgb.length; i += 3, p += 1) {
    gray[p] = rgb[i] * 0.299 + rgb[i + 1] * 0.587 + rgb[i + 2] * 0.114;
  }

  const out = Buffer.alloc(width * height * 3);

  const idx = (x, y) => y * width + x;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = clamp(x - 1, 0, width - 1);
      const x1 = x;
      const x2 = clamp(x + 1, 0, width - 1);
      const y0 = clamp(y - 1, 0, height - 1);
      const y1 = y;
      const y2 = clamp(y + 1, 0, height - 1);

      const tl = gray[idx(x0, y0)];
      const tc = gray[idx(x1, y0)];
      const tr = gray[idx(x2, y0)];
      const ml = gray[idx(x0, y1)];
      const mr = gray[idx(x2, y1)];
      const bl = gray[idx(x0, y2)];
      const bc = gray[idx(x1, y2)];
      const br = gray[idx(x2, y2)];

      const dx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const dy = bl + 2 * bc + br - (tl + 2 * tc + tr);

      let nx = (-dx / 255) * strength;
      let ny = (-dy / 255) * strength;
      let nz = 1.0;

      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const o = (y * width + x) * 3;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }

  return out;
}

function buildRoughnessMapFromRgb(
  rgb,
  width,
  height,
  roughnessBase,
  roughnessSlope,
  roughnessMin,
  roughnessMax
) {
  const out = Buffer.alloc(width * height * 3);

  for (let i = 0, p = 0; i < rgb.length; i += 3, p += 3) {
    const gray = rgb[i] * 0.299 + rgb[i + 1] * 0.587 + rgb[i + 2] * 0.114;
    const rough = clamp(
      Math.round(roughnessBase + (gray - 128) * roughnessSlope),
      roughnessMin,
      roughnessMax
    );
    out[p] = rough;
    out[p + 1] = rough;
    out[p + 2] = rough;
  }

  return out;
}

async function generateFamilyMaps(family, sourceOption) {
  const tune = getTuneForFamily(family);
  const basePath = path.join(OUT_BASE, sourceOption, "basecolor.jpg");

  const { data, info } = await sharp(basePath)
    .resize(1024, 1024, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const normalRgb = buildNormalMapFromRgb(
    data,
    info.width,
    info.height,
    tune.normalStrength
  );
  const roughnessRgb = buildRoughnessMapFromRgb(
    data,
    info.width,
    info.height,
    tune.roughnessBase,
    tune.roughnessSlope,
    tune.roughnessMin,
    tune.roughnessMax
  );

  await sharp(normalRgb, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUT_FABRICS, family, "normal.jpg"));

  await sharp(roughnessRgb, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(path.join(OUT_FABRICS, family, "roughness.jpg"));
}

async function main() {
  await ensureDirs();

  for (const option of OPTIONS) {
    const inputPath = path.join(SRC_DIR, `${option}.jpg`);
    try {
      await fs.access(inputPath);
    } catch {
      throw new Error(`Missing source image: ${inputPath}`);
    }
  }

  for (const option of OPTIONS) {
    await generateOptionAssets(option);
  }

  for (const [family, sourceOption] of Object.entries(FAMILY_SOURCE)) {
    await generateFamilyMaps(family, sourceOption);
  }

  console.log("Generated Dawson assets:");
  console.log(`- Swatches: ${OUT_SWATCH}`);
  console.log(`- Closeups: ${OUT_CLOSEUP}`);
  console.log(`- Basecolor maps: ${OUT_BASE}`);
  console.log(`- Shared fabric maps: ${OUT_FABRICS}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
