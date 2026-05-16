import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "incoming", "dawson-reference", "originals");
const OUT = path.join(ROOT, "reports", "dawson-comparison");
const AFTER = path.join(ROOT, "public", "pbr", "fabrics");

const FAMILY_SOURCE = {
  "linen-slub-weave": "navagio-seagull",
  twill: "indigo-blue",
  "textured-plain-weave": "marcel-smoke-grey",
  "performance-fleece": "peyton-moss",
  "infinity-boucle": "infinity-boucle-ginger",
};

const PASS1 = {
  "linen-slub-weave": {
    cropBandRatio: 0.44,
    saturation: 1.03,
    brightness: 1.0,
    normalStrength: 1.55,
    roughnessBase: 205,
    roughnessSlope: 0.24,
    roughnessMin: 160,
    roughnessMax: 238,
  },
  twill: {
    cropBandRatio: 0.42,
    saturation: 1.08,
    brightness: 1.0,
    normalStrength: 1.9,
    roughnessBase: 196,
    roughnessSlope: 0.26,
    roughnessMin: 145,
    roughnessMax: 232,
  },
  "textured-plain-weave": {
    cropBandRatio: 0.43,
    saturation: 1.04,
    brightness: 1.0,
    normalStrength: 2.0,
    roughnessBase: 210,
    roughnessSlope: 0.28,
    roughnessMin: 165,
    roughnessMax: 242,
  },
  "performance-fleece": {
    cropBandRatio: 0.4,
    saturation: 1.03,
    brightness: 1.0,
    normalStrength: 1.15,
    roughnessBase: 214,
    roughnessSlope: 0.2,
    roughnessMin: 178,
    roughnessMax: 244,
  },
  "infinity-boucle": {
    cropBandRatio: 0.42,
    saturation: 1.06,
    brightness: 1.0,
    normalStrength: 2.4,
    roughnessBase: 216,
    roughnessSlope: 0.33,
    roughnessMin: 172,
    roughnessMax: 248,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function getTopTextureSquare(inputPath, ratio) {
  const img = sharp(inputPath);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Invalid image metadata: ${inputPath}`);
  }

  const textureBandHeight = Math.max(256, Math.floor(meta.height * clamp(ratio, 0.2, 0.8)));
  const square = Math.min(meta.width, textureBandHeight);
  const left = Math.floor((meta.width - square) / 2);

  return img.extract({ left, top: 0, width: square, height: square });
}

function buildNormalMapFromRgb(rgb, width, height, strength) {
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

function buildRoughnessMapFromRgb(rgb, width, height, tune) {
  const out = Buffer.alloc(width * height * 3);

  for (let i = 0, p = 0; i < rgb.length; i += 3, p += 3) {
    const gray = rgb[i] * 0.299 + rgb[i + 1] * 0.587 + rgb[i + 2] * 0.114;
    const rough = clamp(
      Math.round(tune.roughnessBase + (gray - 128) * tune.roughnessSlope),
      tune.roughnessMin,
      tune.roughnessMax
    );
    out[p] = rough;
    out[p + 1] = rough;
    out[p + 2] = rough;
  }

  return out;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  for (const [family, source] of Object.entries(FAMILY_SOURCE)) {
    const tune = PASS1[family];
    const square = await getTopTextureSquare(path.join(SRC, `${source}.jpg`), tune.cropBandRatio);

    const { data, info } = await square
      .clone()
      .resize(1024, 1024, { fit: "cover" })
      .modulate({ saturation: tune.saturation, brightness: tune.brightness })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const normalBefore = buildNormalMapFromRgb(data, info.width, info.height, tune.normalStrength);
    const roughBefore = buildRoughnessMapFromRgb(data, info.width, info.height, tune);

    const beforeNormalPath = path.join(OUT, `${family}-normal-before.jpg`);
    const beforeRoughPath = path.join(OUT, `${family}-roughness-before.jpg`);

    await sharp(normalBefore, { raw: { width: info.width, height: info.height, channels: 3 } })
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(beforeNormalPath);

    await sharp(roughBefore, { raw: { width: info.width, height: info.height, channels: 3 } })
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(beforeRoughPath);

    const afterNormalPath = path.join(AFTER, family, "normal.jpg");
    const afterRoughPath = path.join(AFTER, family, "roughness.jpg");

    const normalLeft = await sharp(beforeNormalPath).resize(512, 512).toBuffer();
    const normalRight = await sharp(afterNormalPath).resize(512, 512).toBuffer();
    const roughLeft = await sharp(beforeRoughPath).resize(512, 512).toBuffer();
    const roughRight = await sharp(afterRoughPath).resize(512, 512).toBuffer();

    await sharp({
      create: { width: 1024, height: 512, channels: 3, background: "#202020" },
    })
      .composite([
        { input: normalLeft, left: 0, top: 0 },
        { input: normalRight, left: 512, top: 0 },
      ])
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(path.join(OUT, `${family}-normal-before-after.jpg`));

    await sharp({
      create: { width: 1024, height: 512, channels: 3, background: "#202020" },
    })
      .composite([
        { input: roughLeft, left: 0, top: 0 },
        { input: roughRight, left: 512, top: 0 },
      ])
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(path.join(OUT, `${family}-roughness-before-after.jpg`));
  }

  console.log("comparison files ready in reports/dawson-comparison");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
