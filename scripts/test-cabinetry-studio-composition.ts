import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), "utf8");

const studio = read("features/cabinetry/components/CabinetryStudio.tsx");
const guided = read(
  "features/cabinetry/components/CabinetryStudioGuidedView.tsx"
);
const detailed = read(
  "features/cabinetry/components/CabinetryStudioDetailedView.tsx"
);
const contract = read(
  "features/cabinetry/components/CabinetryStudio.contract.ts"
);
const overlay = read(
  "components/editor/design-page/CabinetryStudioOverlay.tsx"
);

assert.match(
  studio,
  /export default function CabinetryStudio\([\s\S]*?: CabinetryStudioProps\)/
);
assert.match(
  studio,
  /export type \{ CabinetryStudioProps \} from "\.\/CabinetryStudio\.contract"/
);
assert.match(
  contract,
  /mode: "create" \| "edit"[\s\S]*?accessLevel: "consumer" \| "pro"[\s\S]*?onSave\?[\s\S]*?onPlaceInPlan\?[\s\S]*?onCancel\?/
);

assert.match(studio, /from "\.\/CabinetryStudioGuidedView"/);
assert.match(studio, /from "\.\/CabinetryStudioDetailedView"/);
assert.match(
  studio,
  /if \(effectiveExperienceMode === "guided"\)[\s\S]*?<CabinetryStudioGuidedView[\s\S]*?return \([\s\S]*?<CabinetryStudioDetailedView/
);
assert.match(
  studio,
  /const effectiveExperienceMode = isProWorkspace \? experienceMode : "guided"/,
  "Consumer access must remain pinned to Guided mode."
);
assert.doesNotMatch(
  studio,
  /data-experience="/,
  "The coordinator must not regain mode-view markup."
);

for (const [name, source, experience] of [
  ["Guided", guided, "guided"],
  ["Detailed", detailed, "detailed"],
] as const) {
  assert.match(
    source,
    new RegExp(
      `export type CabinetryStudio${name}ViewBindings = readonly \\[[\\s\\S]*?mode: "create" \\| "edit"`
    )
  );
  const tupleBody = source.match(
    new RegExp(
      `export type CabinetryStudio${name}ViewBindings = readonly \\[([\\s\\S]*?)\\n\\];`
    )
  )?.[1];
  const bindingBody = studio.match(
    new RegExp(
      `<CabinetryStudio${name}View[\\s\\S]*?bindings=\\{\\[([\\s\\S]*?)\\]\\}`
    )
  )?.[1];
  assert.ok(tupleBody && bindingBody);
  const tupleNames = tupleBody
    .split("\n")
    .map((line) => line.match(/^\s*([A-Za-z0-9_]+):/)?.[1])
    .filter((value): value is string => Boolean(value));
  const bindingNames = bindingBody
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter(Boolean);
  assert.deepEqual(
    bindingNames,
    tupleNames,
    `${name} binding values must retain their labeled tuple order.`
  );
  assert.match(source, new RegExp(`data-experience="${experience}"`));
  assert.match(source, /data-mode=\{mode\}/);
  assert.match(source, /data-busy-action=\{busyAction \?\? ""\}/);
  assert.match(source, /actionError=\{actionError\}/);
  assert.match(source, /actionSuccess=\{actionSuccess\}/);
  assert.match(source, /canUndo=\{canUndo\}/);
  assert.match(source, /canRedo=\{canRedo\}/);
  for (const forbidden of [
    /\buse(?:State|Effect|Memo|Ref|Callback|DeferredValue)\b/,
    /\bsetDefinition\(/,
    /window\.localStorage/,
    /from ["'][^"']*\/(?:storage|infrastructure)\//,
    /\bemitCabinetStudioAnalytics\b/,
    /\bcreateCabinetStudioPlacementPayload\b/,
    /\bgenerateCabinetParts\b/,
  ]) {
    assert.doesNotMatch(
      source,
      forbidden,
      `${name} view must remain an IO-free render boundary (${forbidden}).`
    );
  }
}

assert.match(guided, /<CabinetGuidedStepNavigation\b/);
assert.match(guided, /<CabinetGuidedPreviewPanel\b/);
assert.match(guided, /<CabinetGuidedReviewPanel\b/);
assert.match(guided, /<CabinetGuidedActionFooter\b/);
assert.doesNotMatch(guided, /<CabinetStudioNavigator\b/);

assert.match(detailed, /<CabinetStudioNavigator\b/);
assert.match(detailed, /<CabinetDetailedCompactPreview\b/);
assert.match(detailed, /<CabinetDetailedPreviewPanel\b/);
assert.match(detailed, /<CabinetStudioOutputsPanel\b/);
assert.doesNotMatch(detailed, /<CabinetGuidedStepNavigation\b/);

const integrityCheck = studio.indexOf("const initialNumericIntegrityIssue");
const definitionInitialization = studio.indexOf("useState<CabinetDefinition>");
const experienceBranch = studio.lastIndexOf(
  'if (effectiveExperienceMode === "guided")'
);
const saveHandler = studio.indexOf("const handleSave = async");
assert.ok(integrityCheck >= 0 && integrityCheck < definitionInitialization);
assert.ok(
  saveHandler >= 0 && saveHandler < experienceBranch,
  "Initialization and action ownership must remain in the coordinator before view selection."
);

assert.match(
  overlay,
  /dynamic<CabinetryStudioProps>[\s\S]*?import\("@\/features\/cabinetry\/components\/CabinetryStudio"\)[\s\S]*?ssr: false/
);
assert.match(
  overlay,
  /loading:[\s\S]*?role="status"[\s\S]*?aria-live="polite"/
);

console.log(
  "Cabinetry Studio Batch 8 composition checks passed (stable facade, coordinator-owned lifecycle, isolated Guided/Detailed views, preserved mode/error/loading contracts)."
);
