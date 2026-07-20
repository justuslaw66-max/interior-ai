import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contractSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetryStudio.contract.ts"),
  "utf8"
);
const studioSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
const overlaySource = readFileSync(
  resolve(root, "components/editor/design-page/CabinetryStudioOverlay.tsx"),
  "utf8"
);

assert.match(
  contractSource,
  /export interface CabinetryStudioProps[\s\S]*?mode: "create" \| "edit"[\s\S]*?accessLevel: "consumer" \| "pro"[\s\S]*?onSave\?[\s\S]*?onPlaceInPlan\?[\s\S]*?onCancel\?/,
  "The extracted contract must preserve the existing public studio props."
);
assert.match(
  studioSource,
  /export type \{ CabinetryStudioProps \} from "\.\/CabinetryStudio\.contract"/,
  "The original module must preserve its named CabinetryStudioProps export."
);
assert.match(
  overlaySource,
  /import type \{ CabinetryStudioProps \} from "@\/features\/cabinetry\/components\/CabinetryStudio\.contract"/,
  "The overlay must consume the contract without loading the studio implementation."
);
assert.match(
  overlaySource,
  /dynamic<CabinetryStudioProps>[\s\S]*?import\("@\/features\/cabinetry\/components\/CabinetryStudio"\)[\s\S]*?module\.default/,
  "The studio implementation must remain behind a typed dynamic import."
);
assert.doesNotMatch(
  overlaySource,
  /import CabinetryStudio(?:,|\s+from)/,
  "The overlay must not restore an eager CabinetryStudio import."
);
assert.match(
  overlaySource,
  /loading:[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?Loading cabinetry studio/,
  "The lazy boundary must expose an accessible loading state."
);

console.log("Cabinetry studio contract and lazy runtime boundary checks passed.");
