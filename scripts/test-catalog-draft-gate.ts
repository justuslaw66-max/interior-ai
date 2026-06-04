import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

import { runCatalogQualityAudit } from "../lib/catalog-audit";

const baseDraftRug = `
brand: "Castlery"
status: "draft"
category: "rug"
product_family: "Draft Rug"
product_name: "Draft Rug"
variant: "200x300"
price_usd: 399
price_band: "mid"
brand_tier: "premium_mid"
design_zone: "living_zone"
anchor_role: "secondary"
dimensions:
  width_cm: 300
  depth_cm: 200
  height_cm: 1
size_class: "large"
shape: "rectangular"
material_family: "fabric"
color_family: "beige"
tone: "neutral"
style_cluster: "modern"
room_compatibility:
  - "living_room"
design_pairings:
  - "sofa"
variants:
  - variant: "Draft Rug / 200x300"
    price_usd: 399
    price_band: "mid"
    brand_tier: "premium_mid"
    dimensions:
      width_cm: 300
      depth_cm: 200
      height_cm: 1
    materials:
      pile:
        structure: "fabric"
    finish:
      color_finish: "beige"
`;

function writeCatalog(rootDir: string, yaml: string): void {
  const itemDir = path.join(rootDir, "rugs", "draft_rug");
  fs.mkdirSync(itemDir, { recursive: true });
  fs.writeFileSync(path.join(itemDir, "catalog.yaml"), yaml.trimStart(), "utf8");
}

function run(): void {
  const draftRoot = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-draft-gate-"));
  writeCatalog(draftRoot, baseDraftRug);
  const draftResult = runCatalogQualityAudit(draftRoot);

  assert.equal(draftResult.failureCount, 0, "Draft entries should not fail publish-readiness gates");
  assert(
    draftResult.warningCount > 0,
    "Draft entries with missing publish data should report visible blockers as warnings",
  );
  assert(
    draftResult.warningFiles[0]?.warnings.some((warning) => warning.includes("draft blocker")),
    "Draft blocker warnings should be explicitly labeled",
  );

  const activeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-active-gate-"));
  writeCatalog(activeRoot, baseDraftRug.replace('status: "draft"', 'status: "active"'));
  const activeResult = runCatalogQualityAudit(activeRoot);

  assert(activeResult.failureCount > 0, "Active entries should still fail missing publish-readiness data");

  console.log("Catalog draft gate checks passed");
}

run();
