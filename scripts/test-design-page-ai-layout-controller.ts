import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CATALOG_ITEMS } from "../lib/catalog";
import {
  buildAiLayoutCatalogEntries,
  buildAiLayoutItemsFromPlan,
  buildLocalAiStarterPlan,
  describeAiStarterValidationIssues,
  getRequiredAiLayoutCatalogCounts,
  type ClampAiLayoutItem,
} from "../lib/design-page-ai-layout";

const liveCatalog = buildAiLayoutCatalogEntries();
assert.equal(liveCatalog.length, Object.keys(CATALOG_ITEMS).length);
assert.ok(liveCatalog.every((entry) => entry.dimensions.w > 0));

const fixtureBase = Object.values(CATALOG_ITEMS)[0];
assert.ok(fixtureBase, "Expected a catalog fixture to clone.");
const fixtureProduct = (
  id: string,
  category: (typeof fixtureBase)["category"]
) => ({
  ...fixtureBase,
  id,
  category,
  title: id,
});
const fixtureCatalog = {
  "fixture-sofa": fixtureProduct("fixture-sofa", "sofa"),
  "fixture-rug": fixtureProduct("fixture-rug", "rug"),
  "fixture-coffee": fixtureProduct("fixture-coffee", "coffee_table"),
  "fixture-tv": fixtureProduct("fixture-tv", "tv_console"),
  "fixture-chair": fixtureProduct("fixture-chair", "accent_chair"),
  "fixture-lamp": fixtureProduct("fixture-lamp", "floor_lamp"),
};
const catalog = buildAiLayoutCatalogEntries(fixtureCatalog);

const requiredCounts = getRequiredAiLayoutCatalogCounts(catalog);
assert.ok(requiredCounts.sofa > 0, "The live AI catalog needs at least one sofa.");
assert.ok(
  requiredCounts.coffee_table > 0,
  "The live AI catalog needs at least one coffee table."
);

const validationIssues = describeAiStarterValidationIssues({
  picks: {
    sofa: "missing-sofa",
    coffee_table: null,
  },
});
assert.deepEqual(validationIssues, [
  "sofa catalog item not found: missing-sofa",
  "coffee_table missing catalog item",
]);

const requestedRoles = [
  "sofa",
  "coffee_table",
  "rug",
  "tv_console",
  "accent_chair",
  "floor_lamp",
] as const;
const starter = buildLocalAiStarterPlan({
  seed: 314159,
  requestedRoles: [...requestedRoles],
  style: "Modern",
  budget: "$$",
  catalogItems: fixtureCatalog,
});
const repeatedStarter = buildLocalAiStarterPlan({
  seed: 314159,
  requestedRoles: [...requestedRoles],
  style: "Modern",
  budget: "$$",
  catalogItems: fixtureCatalog,
});
assert.deepEqual(starter, repeatedStarter, "Local fallback selection must stay seeded.");
assert.ok(starter.picks?.sofa);
assert.ok(starter.picks?.coffee_table);
assert.deepEqual(starter.meta?.requestedRoles, requestedRoles);

let nextId = 0;
const identityClamp: ClampAiLayoutItem = (x, z) => [x, z];
const built = buildAiLayoutItemsFromPlan({
  plan: starter,
  roomWidth: 6,
  roomDepth: 5,
  wallThickness: 0.12,
  style: "Modern",
  budget: "$$",
  createInstanceId: () => `ai-item-${++nextId}`,
  clampToRoom: identityClamp,
  catalogItems: fixtureCatalog,
});
assert.ok(built.items.length >= 2);
assert.equal(built.items[0]?.instanceId, "ai-item-1");
assert.equal(new Set(built.items.map((item) => item.instanceId)).size, built.items.length);

assert.ok(
  built.items.some((item) =>
    Object.values(fixtureCatalog).some(
      (product) => product.id === item.productId && product.category === "rug"
    )
  )
);

if (starter.picks?.tv_console) {
  const tvItem = built.items.find((item) => item.productId === starter.picks?.tv_console);
  assert.ok(tvItem);
  assert.equal(
    Object.prototype.hasOwnProperty.call(tvItem, "rotationY"),
    false,
    "The extracted builder must preserve the prior undefined TV rotation."
  );
}

const pageSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignPageWorkspace.tsx"
  ),
  "utf8"
);
const controllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageAiLayout.ts"),
  "utf8"
);
const registrationFacadeSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPageAiPanelRegistrationFacade.ts"
  ),
  "utf8"
);
const workspaceRegistrationSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageAiWorkspaceRegistration.ts"),
  "utf8"
);
assert.match(pageSource, /useDesignPageAiWorkspaceRegistration\(\{/);
assert.doesNotMatch(pageSource, /\buseDesignPageAiLayout\(\{/);
assert.match(
  workspaceRegistrationSource,
  /useDesignPageAiPanelRegistrationFacade\(\{/
);
assert.match(registrationFacadeSource, /useDesignPageAiLayout\(\{/);
assert.doesNotMatch(pageSource, /const runAiLayout\s*=/);
assert.match(controllerSource, /fetch\("\/api\/ai\/layout"/);
assert.match(controllerSource, /floorPlanQualityContext/);
assert.match(controllerSource, /"Apply AI layout proposal"/);
assert.match(controllerSource, /openGuestPrompt\("ai_layout"/);
assert.match(controllerSource, /ai_layout_fallback_used/);
assert.match(controllerSource, /ai_layout_unsupported_room_type/);

console.log("Design page AI layout controller checks passed");
