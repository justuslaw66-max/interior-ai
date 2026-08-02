import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  inspectFloorPlanOptionalConfigurations,
  resolveFloorPlanAuthoredConfiguration,
  validateFloorPlanConfigurationGroup,
} from "@/lib/floor-plan-optional-configurations";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";

const bundle = loadPingYiCourtV2ReviewSeedBundle();
assert.equal(bundle.configurationGroups.length, 1);
const typeTwoGroup = bundle.configurationGroups[0];
assert.equal(typeTwoGroup.groupId, "2-room-flexi-type-2");
assert.deepEqual(
  typeTwoGroup.variants.map((variant) => ({
    optionId: variant.optionId,
    defaultSelected: variant.defaultSelected,
    kind: variant.artifact.kind,
  })),
  [
    { optionId: "open-flex", defaultSelected: true, kind: "authored_revision" },
    { optionId: "partitioned-flex", defaultSelected: false, kind: "authored_revision" },
  ]
);

const open = bundle.fixtures.find(
  (fixture) => fixture.layoutId === "2-room-flexi-type-2-open"
);
const partitioned = bundle.fixtures.find(
  (fixture) => fixture.layoutId === "2-room-flexi-type-2-partitioned"
);
const fiveRoom = bundle.fixtures.find((fixture) => fixture.layoutId === "5-room");
assert.ok(open && partitioned && fiveRoom);

const openOptions = inspectFloorPlanOptionalConfigurations(
  open.document,
  bundle.configurationGroups
);
assert.equal(openOptions.length, 1);
assert.equal(openOptions[0].configurationId, "partitioned-flex");
assert.equal(openOptions[0].status, "authored_variant_available");
assert.equal(openOptions[0].sourceSupported, true);
assert.deepEqual(openOptions[0].sourcePages, [3]);
assert.equal(
  inspectFloorPlanOptionalConfigurations(open.document)[0].status,
  "annotation_only",
  "A review-seed relationship is not automatically a public selectable relationship."
);

const selected = resolveFloorPlanAuthoredConfiguration({
  group: typeTwoGroup,
  optionId: "partitioned-flex",
  document: partitioned.document,
});
assert.notEqual(selected, partitioned.document);
assert.ok(selected.floors[0].rooms.some((room) => room.id === "flex"));
assert.throws(
  () => resolveFloorPlanAuthoredConfiguration({
    group: typeTwoGroup,
    optionId: "partitioned-flex",
    // An annotation in the open plan is never executable geometry.
    document: open.document,
  }),
  /does not match the authored revision reference/
);
const tamperedPartitioned = structuredClone(partitioned.document);
tamperedPartitioned.floors[0].vertices[0].xMm += 10;
assert.throws(
  () => resolveFloorPlanAuthoredConfiguration({
    group: typeTwoGroup,
    optionId: "partitioned-flex",
    document: tamperedPartitioned,
  }),
  /geometry integrity check/
);

const ambiguousGroup = structuredClone(typeTwoGroup);
ambiguousGroup.groupId = "another-source-layout";
assert.equal(
  inspectFloorPlanOptionalConfigurations(open.document, [
    typeTwoGroup,
    ambiguousGroup,
  ])[0].status,
  "annotation_only",
  "An option ID shared by two groups must fail closed without an exact group binding."
);

const studyOptions = inspectFloorPlanOptionalConfigurations(
  fiveRoom.document,
  bundle.configurationGroups
);
assert.equal(studyOptions.length, 1);
assert.equal(studyOptions[0].configurationId, "suggested-study");
assert.equal(studyOptions[0].status, "annotation_only");
assert.equal(
  fiveRoom.document.floors[0].rooms.some((room) => room.name.toLowerCase().includes("study")),
  false,
  "SUGGESTED STUDY must remain non-physical without an authored variant."
);

const invalidDefaults = structuredClone(typeTwoGroup);
invalidDefaults.variants.forEach((variant) => {
  variant.defaultSelected = true;
});
assert.throws(
  () => validateFloorPlanConfigurationGroup(invalidDefaults),
  /exactly one default variant/
);
assert.equal(
  inspectFloorPlanOptionalConfigurations(open.document, [invalidDefaults])[0].status,
  "annotation_only",
  "Malformed variant metadata must not hide the source mark or enable geometry."
);

const component = fs.readFileSync(
  path.join(process.cwd(), "components/editor/FloorPlanOptionalConfigurationPanel.tsx"),
  "utf8"
);
assert.match(component, /A label or dashed outline never creates a room or wall/);
assert.match(component, /No authored geometry variant is attached/);
assert.match(component, /Use reviewed/);

const addressSearch = fs.readFileSync(
  path.join(process.cwd(), "components/editor/FloorPlanAddressSearch.tsx"),
  "utf8"
);
assert.match(addressSearch, /floor-plan-configuration-confirmation/);
assert.match(addressSearch, /inspectFloorPlanOptionalConfigurations/);
assert.match(addressSearch, /Use selected reviewed layout/);
assert.match(addressSearch, /loads its own approved immutable revision/);
const publicPanelCall = addressSearch.match(
  /<FloorPlanOptionalConfigurationPanel([\s\S]*?)\/>/
)?.[1] ?? "";
assert.match(publicPanelCall, /\bpublicGroups=/);
assert.match(publicPanelCall, /\bonChoosePublicVariant=/);

const importReview = fs.readFileSync(
  path.join(
    process.cwd(),
    "components/editor/floor-plan-import-review/FloorPlanImportReviewPanel.tsx"
  ),
  "utf8"
);
assert.match(importReview, /FloorPlanOptionalConfigurationPanel/);

console.log("Floor-plan optional-configuration fail-closed checks passed.");
