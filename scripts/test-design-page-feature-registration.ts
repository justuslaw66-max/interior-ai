import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const onboardingRegistrationSource = readSource(
  "lib/useDesignPageOnboardingRegistrationFacade.ts"
);
const cabinetryRegistrationSource = readSource(
  "lib/useDesignPageCabinetryRegistrationFacade.ts"
);

assert.match(
  workspaceSource,
  /import \{ useDesignPageOnboardingRegistrationFacade \} from "@\/lib\/useDesignPageOnboardingRegistrationFacade";/,
  "The workspace should import the onboarding registration facade."
);
assert.match(
  workspaceSource,
  /import \{ useDesignPageCabinetryRegistrationFacade \} from "@\/lib\/useDesignPageCabinetryRegistrationFacade";/,
  "The workspace should import the cabinetry registration facade."
);
assert.doesNotMatch(
  workspaceSource,
  /from "@\/lib\/useDesignPageOnboarding"|\buseDesignPageOnboarding\(\{/,
  "The workspace should not directly own onboarding hook registration."
);
assert.doesNotMatch(
  workspaceSource,
  /from "@\/features\/cabinetry\/useDesignPageCabinetry"|\buseDesignPageCabinetry\(\{/,
  "The workspace should not directly own cabinetry hook registration."
);

const registrationOrder = [
  "useDesignPageCommerceActions({",
  "useDesignPageOnboardingRegistrationFacade({",
  "useDesignPageCabinetryRegistrationFacade({",
  "useDesignPagePlacementSelectionWorkspaceFacade({",
];
let previousRegistrationIndex = -1;
for (const marker of registrationOrder) {
  const index = workspaceSource.indexOf(marker);
  assert.ok(
    index > previousRegistrationIndex,
    `Feature registration order changed: ${marker}`
  );
  previousRegistrationIndex = index;
}

assert.match(
  workspaceSource,
  /useDesignPageOnboardingRegistrationFacade\(\{[\s\S]*?isGuest:\s*!session\?\.user[\s\S]*?designRoomCount:\s*designSnapshot\.rooms\.length[\s\S]*?planRoomCount:\s*housePlan2D\.rooms\.length[\s\S]*?saveStatusKind:\s*saveStatus\.kind[\s\S]*?autoCreateSeatingZone,[\s\S]*?clampToRoom:\s*clampToActiveRoom[\s\S]*?showConstraintsForMoment,[\s\S]*?showConfidenceSummary,[\s\S]*?logFunnelEvent,[\s\S]*?roomWidth,[\s\S]*?roomDepth,[\s\S]*?wallThickness,/,
  "The onboarding registration should retain identity, document, feedback, and room inputs."
);
assert.match(
  onboardingRegistrationSource,
  /useDesignPageOnboarding\(\{[\s\S]*?state,[\s\S]*?actions,[\s\S]*?configuration,[\s\S]*?return \{ state: onboardingState \};/,
  "The onboarding facade should delegate the grouped contract and return only state."
);

assert.match(
  workspaceSource,
  /useDesignPageCabinetryRegistrationFacade\(\{[\s\S]*?activeRoom:\s*activeRoom \?\? null[\s\S]*?planRoomById:\s*houseRoomById[\s\S]*?activeSurfaceTarget,[\s\S]*?selectedWallFaceId:\s*activeSelectedWallFaceId[\s\S]*?refs:\s*\{ designSnapshot: designSnapshotRef, activeItems: itemsRef \}[\s\S]*?commitItemsToRoom,[\s\S]*?clampToCatalogPlacementRoom,[\s\S]*?isCatalogPlacementContainedInRoom,[\s\S]*?showToast:\s*showRuleToast/,
  "The cabinetry registration should retain room, surface, ref, placement, and document inputs."
);
assert.match(
  cabinetryRegistrationSource,
  /const activePlanRoom =[\s\S]*?planRoomById\.get\(cabinetryState\.activeRoom\.id\)[\s\S]*?activeSurfaceTarget === "selected_wall" \? selectedWallFaceId : null;/,
  "The cabinetry facade should preserve active-plan-room and preferred-wall derivation."
);
assert.match(
  cabinetryRegistrationSource,
  /targetRef\.current = nextItems;[\s\S]*?useDesignPageCabinetry\(\{[\s\S]*?getDesignSnapshot:\s*\(\) => refs\.designSnapshot\.current[\s\S]*?replaceActiveItemsSnapshot\(refs\.activeItems, nextItems\);[\s\S]*?actions,[\s\S]*?boundaries:\s*\{ cabinetry \}[\s\S]*?selectedItem:\s*cabinetry\.state\.selected\?\.item \?\? null/,
  "The cabinetry facade should preserve ref bridges, the feature boundary, and selected-item derivation."
);

console.log("Design-page feature registration checks passed.");
