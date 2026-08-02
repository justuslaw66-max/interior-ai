import { generateCabinetCutList } from "./generateCabinetDocumentation";
import type { CabinetCutListItem, CabinetDefinition } from "./types";

const PANEL_GAP_MM = 80;
const ROW_GAP_MM = 120;
const MAX_ROW_WIDTH_MM = 3600;

function sanitizeDxfText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/[\\{}]/g, " ").slice(0, 240);
}

function dxfLine(...values: Array<string | number>): string {
  return values.map(String).join("\n");
}

function fileSafeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "millwork";
}

function cutFace(item: CabinetCutListItem): { width: number; height: number } {
  if (item.cutFace) {
    return {
      width: item[item.cutFace.widthAxis],
      height: item[item.cutFace.heightAxis],
    };
  }
  const dimensions = [item.width, item.height, item.depth].sort((a, b) => b - a);
  return {
    width: dimensions[0] ?? item.width,
    height: dimensions[1] ?? item.height,
  };
}

function grainArrowEntities(
  item: CabinetCutListItem,
  x: number,
  y: number,
  width: number,
  height: number
): string[] {
  if (!item.grainAxis || item.grainAxis === "none") return [];
  const horizontal = item.grainAxis === "cut_width";
  const startX = horizontal ? x + width * 0.2 : x + width * 0.5;
  const startY = horizontal ? y + height * 0.5 : y + height * 0.2;
  const endX = horizontal ? x + width * 0.8 : x + width * 0.5;
  const endY = horizontal ? y + height * 0.5 : y + height * 0.8;
  const arrowSize = Math.max(10, Math.min(40, Math.min(width, height) * 0.08));
  return [
    lineEntity("GRAIN", startX, startY, endX, endY),
    horizontal
      ? lineEntity("GRAIN", endX, endY, endX - arrowSize, endY - arrowSize * 0.5)
      : lineEntity("GRAIN", endX, endY, endX - arrowSize * 0.5, endY - arrowSize),
    horizontal
      ? lineEntity("GRAIN", endX, endY, endX - arrowSize, endY + arrowSize * 0.5)
      : lineEntity("GRAIN", endX, endY, endX + arrowSize * 0.5, endY - arrowSize),
  ];
}

function lineEntity(layer: string, x1: number, y1: number, x2: number, y2: number): string {
  return dxfLine(
    0,
    "LINE",
    8,
    layer,
    10,
    x1,
    20,
    y1,
    30,
    0,
    11,
    x2,
    21,
    y2,
    31,
    0
  );
}

function textEntity(layer: string, x: number, y: number, height: number, text: string): string {
  return dxfLine(
    0,
    "TEXT",
    8,
    layer,
    10,
    x,
    20,
    y,
    30,
    0,
    40,
    height,
    1,
    sanitizeDxfText(text)
  );
}

function rectangleEntities(layer: string, x: number, y: number, width: number, height: number): string[] {
  return [
    lineEntity(layer, x, y, x + width, y),
    lineEntity(layer, x + width, y, x + width, y + height),
    lineEntity(layer, x + width, y + height, x, y + height),
    lineEntity(layer, x, y + height, x, y),
  ];
}

export function buildCabinetFabricationDxfFileName(definition: CabinetDefinition): string {
  return `${fileSafeName(definition.name)}-cut-layout.dxf`;
}

export function buildCabinetFabricationDxf(definition: CabinetDefinition): string {
  const cutList = generateCabinetCutList(definition);
  const entities: string[] = [
    textEntity(
      "NOTES",
      0,
      -140,
      42,
      `Custom Millwork cut layout: ${definition.name} (${definition.id})`
    ),
    textEntity(
      "NOTES",
      0,
      -210,
      28,
      "Units: millimeters. Rectangles use the resolved fabrication cut face; verify machining, joinery, and nesting before CNC release."
    ),
  ];

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const [index, item] of cutList.entries()) {
    const face = cutFace(item);
    if (cursorX > 0 && cursorX + face.width > MAX_ROW_WIDTH_MM) {
      cursorX = 0;
      cursorY += rowHeight + ROW_GAP_MM;
      rowHeight = 0;
    }

    const label = `${index + 1}. ${item.name} ${item.moduleId} ${face.width}x${face.height} ${item.materialName}`;
    entities.push(...rectangleEntities("CUT", cursorX, cursorY, face.width, face.height));
    entities.push(...grainArrowEntities(item, cursorX, cursorY, face.width, face.height));
    entities.push(textEntity("LABEL", cursorX + 12, cursorY + Math.max(28, face.height / 2), 24, label));
    entities.push(
      textEntity(
        "META",
        cursorX + 12,
        cursorY + Math.max(58, face.height / 2 + 34),
        18,
        `part=${item.partId}; material=${item.materialId}; grain=${item.grainDirection ?? "none"}; grainAxis=${item.grainAxis ?? "none"}; edgeTreatment=${item.edgeTreatment ?? "matching_edge_band"}; treatedEdges=${item.treatedEdges?.join("+") ?? ""}; exposedFaces=${item.exposedFaces?.join("+") ?? ""}; edgeBandMm=${item.edgeBandingMm}`
      )
    );

    cursorX += face.width + PANEL_GAP_MM;
    rowHeight = Math.max(rowHeight, face.height);
  }

  return `${[
    0,
    "SECTION",
    2,
    "HEADER",
    9,
    "$INSUNITS",
    70,
    5,
    0,
    "ENDSEC",
    0,
    "SECTION",
    2,
    "TABLES",
    0,
    "TABLE",
    2,
    "LAYER",
    70,
    4,
    0,
    "LAYER",
    2,
    "CUT",
    70,
    0,
    62,
    1,
    6,
    "CONTINUOUS",
    0,
    "LAYER",
    2,
    "GRAIN",
    70,
    0,
    62,
    4,
    6,
    "CONTINUOUS",
    0,
    "LAYER",
    2,
    "LABEL",
    70,
    0,
    62,
    3,
    6,
    "CONTINUOUS",
    0,
    "LAYER",
    2,
    "NOTES",
    70,
    0,
    62,
    5,
    6,
    "CONTINUOUS",
    0,
    "LAYER",
    2,
    "META",
    70,
    0,
    62,
    8,
    6,
    "CONTINUOUS",
    0,
    "ENDTAB",
    0,
    "ENDSEC",
    0,
    "SECTION",
    2,
    "ENTITIES",
    ...entities,
    0,
    "ENDSEC",
    0,
    "EOF",
  ].join("\n")}\n`;
}

export function downloadCabinetFabricationDxf(definition: CabinetDefinition): void {
  const dxf = buildCabinetFabricationDxf(definition);
  const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCabinetFabricationDxfFileName(definition);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
