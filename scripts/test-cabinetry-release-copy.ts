import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const studioSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
const designPageSource = readFileSync(
  resolve(process.cwd(), "app/design/page.tsx"),
  "utf8"
);
const qaRunbookSource = readFileSync(
  resolve(process.cwd(), "docs/qa/cabinetry-studio-mvp.md"),
  "utf8"
);
const documentationSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/generateCabinetDocumentation.ts"),
  "utf8"
);

assert.match(
  documentationSource,
  /export const CABINET_PLANNING_ESTIMATE_DISCLAIMER =\s*\n\s*"Planning estimate only—not a supplier quote, checkout total, purchase order, or fabrication authorization\."/
);

assert.match(studioSource, /data-testid="cabinet-fit-limitations"/);
assert.match(
  studioSource,
  /The current plan does not capture electrical outlets or generic wall obstructions/
);
assert.match(
  studioSource,
  /openings on sloped or ambiguous notch edges may not map automatically/
);
assert.match(studioSource, /Field-verify all services and site conditions before fabrication/);
assert.doesNotMatch(
  studioSource,
  /Outlet and baseboard locations are only considered when recorded/
);
assert.match(studioSource, /No recorded openings · field verification required/);
assert.doesNotMatch(studioSource, /Clear wall · no recorded openings/);
assert.match(studioSource, /data-testid="cabinet-custom-space-limitations"/);
assert.match(studioSource, /stay on this browser and device/);
assert.match(studioSource, /not synchronized to the project or server/);

assert.match(studioSource, /data-testid="cabinet-consumer-estimate-disclaimer"/);
assert.match(studioSource, /data-testid="cabinet-planning-estimate-disclaimer"/);
assert.match(studioSource, /data-testid="cabinet-output-disclaimer"/);
assert.match(studioSource, /sectionTitle\("Planning Estimate"\)/);
assert.match(studioSource, /CABINET_PLANNING_ESTIMATE_DISCLAIMER/);
assert.doesNotMatch(studioSource, /sectionTitle\("Preliminary Quote"\)/);

assert.match(designPageSource, />Planning estimate<\/div>/);
assert.match(designPageSource, /data-testid="selected-cabinet-pricing-disclaimer"/);
assert.match(
  designPageSource,
  /data-testid="selected-cabinet-project-estimate-disclaimer"/
);
assert.match(designPageSource, /CABINET_PLANNING_ESTIMATE_DISCLAIMER/);
assert.match(designPageSource, /Download Planning Estimate/);
assert.match(designPageSource, /Planning estimate package exported/);
assert.doesNotMatch(designPageSource, />Quote total<\/div>/);
assert.doesNotMatch(designPageSource, /Download Project Quote/);

assert.match(
  qaRunbookSource,
  /current plan does not\s+capture electrical outlets or generic wall obstructions/
);
assert.match(qaRunbookSource, /internal SKU mappings are preliminary and not supplier-verified/);
assert.match(
  qaRunbookSource,
  /Planning estimates are not checkout totals, purchase orders, or final fabricator quotes/
);
assert.match(qaRunbookSource, /measured hosts remain on this browser\/device/);

console.log(
  "Cabinetry release-copy checks passed: Fit limitations and planning-estimate boundaries are explicit."
);
