import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createCabinetPreset } from "../features/cabinetry/presets";
import {
  capCabinetCustomSpaces,
  parseStoredCabinetCustomSpace,
  readCabinetInspectorPreferences,
  readSavedCabinetTemplates,
  readStoredCabinetCustomSpaces,
  writeCabinetInspectorPreferences,
  writeSavedCabinetTemplates,
  writeStoredCabinetCustomSpaces,
  type SavedCabinetTemplate,
} from "../features/cabinetry/storage/CabinetStudioLocalStorage";
import type { CabinetHostSpace } from "../features/cabinetry/types";

const customSpaceKey = "interior-ai:millwork-custom-host-spaces:v1";
const inspectorPreferencesKey = "interior-ai:millwork-inspector-preferences:v1";
const savedTemplateKey = "interior-ai:millwork-custom-templates:v1";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  failWrites = false;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("Storage unavailable");
    this.values.set(key, value);
  }
}

function createMeasuredSpace(index: number): CabinetHostSpace {
  return {
    id: `custom-space-${index}`,
    kind: "rectangular_area",
    label: `Measured area ${index}`,
    roomId: "room-1",
    roomName: "Kitchen",
    roomType: "kitchen",
    availableWidthMm: 2400 + index,
    availableHeightMm: 2600,
    availableDepthMm: 650,
    baseboardOffsetMm: 15,
    installationClearanceLeftMm: 10,
    installationClearanceRightMm: 10,
    installationClearanceTopMm: 20,
    mountingHeightMm: 0,
    openings: [],
  };
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

try {
  const validSpace = createMeasuredSpace(1);
  assert.deepEqual(parseStoredCabinetCustomSpace(validSpace), validSpace);
  assert.equal(
    parseStoredCabinetCustomSpace({ ...validSpace, id: "external-space" }),
    null,
    "Only the versioned custom-space identifier namespace may be restored."
  );
  assert.equal(
    parseStoredCabinetCustomSpace({ ...validSpace, availableWidthMm: Number.NaN }),
    null,
    "Non-finite measurements must not enter studio state from storage."
  );
  assert.equal(
    parseStoredCabinetCustomSpace({
      ...validSpace,
      openings: [{ id: "opening-1", kind: "door", offsetMm: 0, widthMm: 800 }],
    }),
    null,
    "Measured custom spaces must remain opening-free."
  );

  const deduplicated = capCabinetCustomSpaces([
    validSpace,
    { ...validSpace, label: "Latest measured area" },
  ]);
  assert.equal(deduplicated.length, 1);
  assert.equal(deduplicated[0]?.label, "Latest measured area");

  const sessionSpace: CabinetHostSpace = {
    ...createMeasuredSpace(99),
    id: "room-wall-1",
    kind: "wall",
    label: "Current room wall",
  };
  const measuredSpaces = Array.from({ length: 26 }, (_, index) =>
    createMeasuredSpace(index)
  );
  const capped = capCabinetCustomSpaces(
    [sessionSpace, ...measuredSpaces],
    measuredSpaces[0]?.id
  );
  assert.equal(capped.length, 25, "Session-only hosts plus 24 measured hosts must be retained.");
  assert.equal(capped[0]?.id, sessionSpace.id);
  assert.equal(capped[1]?.id, measuredSpaces[0]?.id, "The fitted measured host must remain pinned.");

  storage.clear();
  writeStoredCabinetCustomSpaces([sessionSpace, validSpace]);
  assert.deepEqual(readStoredCabinetCustomSpaces(), [validSpace]);

  const updatedSpace = { ...validSpace, label: "Updated measured area" };
  const secondSpace = createMeasuredSpace(2);
  storage.setItem(
    customSpaceKey,
    JSON.stringify({ version: 1, spaces: [validSpace, secondSpace, updatedSpace] })
  );
  assert.deepEqual(readStoredCabinetCustomSpaces(), [secondSpace, updatedSpace]);
  assert.equal(
    storage.getItem(customSpaceKey),
    JSON.stringify({ version: 1, spaces: [secondSpace, updatedSpace] }),
    "Duplicate stored hosts must be rewritten in canonical last-write-wins form."
  );

  storage.setItem(customSpaceKey, JSON.stringify({ version: 2, spaces: [validSpace] }));
  assert.deepEqual(readStoredCabinetCustomSpaces(), []);
  assert.equal(storage.getItem(customSpaceKey), null, "Unsupported versions must be removed.");

  const preferences = {
    moduleOptionsOpen: true,
    advancedOpen: false,
    fabricationOpen: true,
  };
  writeCabinetInspectorPreferences(preferences);
  assert.deepEqual(readCabinetInspectorPreferences(), preferences);
  storage.setItem(
    inspectorPreferencesKey,
    JSON.stringify({ version: 1, ...preferences, advancedOpen: "yes" })
  );
  assert.equal(readCabinetInspectorPreferences(), null);
  assert.equal(storage.getItem(inspectorPreferencesKey), null);

  const template: SavedCabinetTemplate = {
    id: "custom-template-1",
    name: "Kitchen base",
    savedAt: "2026-07-19T00:00:00.000Z",
    definition: createCabinetPreset("base", "cabinet-template-1"),
  };
  writeSavedCabinetTemplates([template]);
  assert.deepEqual(readSavedCabinetTemplates(), [template]);
  storage.setItem(savedTemplateKey, JSON.stringify([template, { id: "invalid" }]));
  assert.deepEqual(readSavedCabinetTemplates(), [template]);

  storage.failWrites = true;
  assert.throws(
    () => writeSavedCabinetTemplates([template]),
    /This browser could not store the reusable template locally\./
  );
  storage.failWrites = false;

  const studioSource = readFileSync(
    resolve(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
    "utf8"
  );
  assert.match(studioSource, /from "\.\.\/storage\/CabinetStudioLocalStorage"/);
  assert.doesNotMatch(
    studioSource,
    /interior-ai:millwork-(?:custom-templates|custom-host-spaces|inspector-preferences):v1/,
    "Studio persistence keys must remain owned by the storage boundary."
  );
} finally {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
}

console.log("Cabinetry studio local-storage checks passed.");
