import { deflateSync } from "node:zlib";
import { CAD_SOURCE_LIMITS, type CadParsedSource, type CadPoint } from "./cad-types";

const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 900;
const PREVIEW_MARGIN = 40;

export type CadPreviewLayout = {
  widthPx: number;
  heightPx: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  scalePxPerUnit: number;
};

function allPoints(parsed: CadParsedSource) {
  return [
    ...parsed.paths.flatMap((path) => path.points),
    ...parsed.texts.flatMap((text) => (text.point ? [text.point] : [])),
  ];
}

export function computeCadPreviewLayout(parsed: CadParsedSource): CadPreviewLayout {
  const points = allPoints(parsed);
  if (!points.length) {
    return {
      widthPx: 64,
      heightPx: 64,
      minX: 0,
      minY: 0,
      maxX: 1,
      maxY: 1,
      scalePxPerUnit: 1,
    };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const extentX = Math.max(1e-9, maxX - minX);
  const extentY = Math.max(1e-9, maxY - minY);
  const scalePxPerUnit = Math.min(
    (PREVIEW_WIDTH - PREVIEW_MARGIN * 2) / extentX,
    (PREVIEW_HEIGHT - PREVIEW_MARGIN * 2) / extentY
  );
  return {
    widthPx: PREVIEW_WIDTH,
    heightPx: PREVIEW_HEIGHT,
    minX,
    minY,
    maxX,
    maxY,
    scalePxPerUnit,
  };
}

export function cadPointToPreview(point: CadPoint, layout: CadPreviewLayout) {
  const drawingWidth = (layout.maxX - layout.minX) * layout.scalePxPerUnit;
  const drawingHeight = (layout.maxY - layout.minY) * layout.scalePxPerUnit;
  const offsetX = (layout.widthPx - drawingWidth) / 2;
  const offsetY = (layout.heightPx - drawingHeight) / 2;
  return {
    x: Math.round(offsetX + (point.x - layout.minX) * layout.scalePxPerUnit),
    y: Math.round(
      layout.heightPx - offsetY - (point.y - layout.minY) * layout.scalePxPerUnit
    ),
  };
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.byteLength);
  result.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(result, 4);
  Buffer.from(data).copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 8 + data.byteLength);
  return result;
}

function setPixel(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  color: readonly [number, number, number]
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 3;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
}

function drawLine(
  pixels: Uint8Array,
  width: number,
  height: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: readonly [number, number, number]
) {
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const sx = start.x < end.x ? 1 : -1;
  const sy = start.y < end.y ? 1 : -1;
  let error = dx - dy;
  while (true) {
    setPixel(pixels, width, height, x, y, color);
    setPixel(pixels, width, height, x + 1, y, color);
    if (x === end.x && y === end.y) break;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
  }
}

function encodeRgbPng(width: number, height: number, pixels: Uint8Array) {
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const target = row * (width * 3 + 1);
    scanlines[target] = 0;
    Buffer.from(pixels.subarray(row * width * 3, (row + 1) * width * 3)).copy(
      scanlines,
      target + 1
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
      pngChunk("IEND", new Uint8Array()),
    ])
  );
}

export function renderCadPreviewPng(parsed: CadParsedSource) {
  const layout = computeCadPreviewLayout(parsed);
  const pixels = new Uint8Array(layout.widthPx * layout.heightPx * 3).fill(255);
  let renderedSegments = 0;
  paths: for (const path of parsed.paths) {
    const color = path.role === "wall" ? ([25, 25, 25] as const) : ([170, 170, 170] as const);
    for (let index = 1; index < path.points.length; index += 1) {
      if (renderedSegments >= CAD_SOURCE_LIMITS.maxPreviewSegments) break paths;
      drawLine(
        pixels,
        layout.widthPx,
        layout.heightPx,
        cadPointToPreview(path.points[index - 1], layout),
        cadPointToPreview(path.points[index], layout),
        color
      );
      renderedSegments += 1;
    }
    if (
      path.closed &&
      path.points.length > 2 &&
      renderedSegments < CAD_SOURCE_LIMITS.maxPreviewSegments
    ) {
      drawLine(
        pixels,
        layout.widthPx,
        layout.heightPx,
        cadPointToPreview(path.points.at(-1) as CadPoint, layout),
        cadPointToPreview(path.points[0], layout),
        color
      );
      renderedSegments += 1;
    }
  }
  for (const text of parsed.texts.slice(0, 1_000)) {
    if (!text.point) continue;
    const center = cadPointToPreview(text.point, layout);
    for (let offset = -2; offset <= 2; offset += 1) {
      setPixel(pixels, layout.widthPx, layout.heightPx, center.x + offset, center.y, [20, 90, 210]);
      setPixel(pixels, layout.widthPx, layout.heightPx, center.x, center.y + offset, [20, 90, 210]);
    }
  }
  return { bytes: encodeRgbPng(layout.widthPx, layout.heightPx, pixels), layout };
}
