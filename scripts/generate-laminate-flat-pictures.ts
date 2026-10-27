import fs from "node:fs";
import path from "node:path";
import { CABINET_LAMINATE_COLLECTIONS } from "../lib/generated/cabinet-laminates.generated";
import { getLaminateFlatPictureUrl } from "../lib/laminate-wall-panel-materials";

// Writes the one-colour pictures of the laminate catalogue's flat colours (the solids), which wall panels draw
// (lib/laminate-wall-panel-materials.ts; J, 27 Oct 2026: "Flat colour sheets"). One 4x8 px PNG per colour, named by it,
// in public/assets/catalog/laminates/flat-colours/. The bytes depend only on the colour: the image data is stored, not
// compressed, so every machine writes the same file. --check fails when a file is missing, different or no longer used.

const WIDTH_PX = 4;
const HEIGHT_PX = 8;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Buffer): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value >>> 0);
  return bytes;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  return Buffer.concat([uint32(data.length), body, uint32(crc32(body))]);
}

/** A zlib stream holding the data in one stored (uncompressed) block. */
function storedZlib(data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt16LE(data.length, 0);
  length.writeUInt16LE(~data.length & 0xffff, 2);
  return Buffer.concat([Buffer.from([0x78, 0x01, 0x01]), length, data, uint32(adler32(data))]);
}

/** A 4x8 px RGB PNG of one colour ("#rrggbb"). */
export function buildFlatColourPng(colour: string): Buffer {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (!match) throw new Error(`Not a #rrggbb colour: ${colour}`);
  const rgb = match.slice(1).map((hex) => Number.parseInt(hex, 16));
  const row = Buffer.from([0, ...Array.from({ length: WIDTH_PX }, () => rgb).flat()]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH_PX, 0);
  header.writeUInt32BE(HEIGHT_PX, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", storedZlib(Buffer.concat(Array.from({ length: HEIGHT_PX }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const LAMINATE_FLAT_PICTURE_DIRECTORY = path.join("public", "assets", "catalog", "laminates", "flat-colours");

/** Every flat colour's picture, by its path relative to the repository. */
export function buildLaminateFlatPictures(): Map<string, Buffer> {
  const colours = CABINET_LAMINATE_COLLECTIONS.flatMap((collection) =>
    collection.laminates.flatMap(([, , , , colour, textureUrl]) => (textureUrl ? [] : [colour]))
  );
  return new Map(
    [...new Set(colours)].sort().map((colour) => [path.join("public", getLaminateFlatPictureUrl(colour)), buildFlatColourPng(colour)])
  );
}

function main(): void {
  const pictures = buildLaminateFlatPictures();
  const directory = path.join(process.cwd(), LAMINATE_FLAT_PICTURE_DIRECTORY);
  // Only the PNGs: Finder's .DS_Store (gitignored) is neither checked nor removed.
  const present = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => name.endsWith(".png")).map((name) => path.join(LAMINATE_FLAT_PICTURE_DIRECTORY, name))
    : [];
  if (process.argv.includes("--check")) {
    const wrong = [...pictures].filter(([file, bytes]) => !fs.existsSync(file) || !fs.readFileSync(file).equals(bytes));
    const unused = present.filter((file) => !pictures.has(file));
    if (wrong.length || unused.length) {
      console.error(`Laminate flat pictures are out of date (${wrong.length} missing or different, ${unused.length} unused). Run npm run generate:laminate-flat-pictures.`);
      process.exit(1);
    }
    console.log(`Laminate flat pictures are current (${pictures.size}).`);
    return;
  }
  fs.mkdirSync(directory, { recursive: true });
  for (const file of present) if (!pictures.has(file)) fs.rmSync(file);
  for (const [file, bytes] of pictures) fs.writeFileSync(file, bytes);
  console.log(`Wrote ${pictures.size} pictures to ${LAMINATE_FLAT_PICTURE_DIRECTORY}.`);
}

if (require.main === module) main();
