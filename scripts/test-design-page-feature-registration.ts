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
const commerceOnboardingSource = readSource(
  "lib/useDesignPageCommerceOnboardingRegistration.ts"
);
const cabinetryRegistrationSource = readSource(
  "lib/useDesignPageCabinetryRegistrationFacade.ts"
);
const cabinetryWorkspaceSource = readSource(
  "lib/useDesignPageCabinetryWorkspaceRegistration.ts"
);

assert.match(
  workspaceSource,
  /import \{ useDesignPageCommerceOnboardingRegistration \} from "@\/lib\/useDesignPageCommerceOnboardingRegistration";/,
  "The workspace should import the commerce/onboarding registration."
);
assert.match(
  workspaceSource,
  /import \{ useDesignPageCabinetryWorkspaceRegistration \} from "@\/lib\/useDesignPageCabinetryWorkspaceRegistration";/,
  "The workspace should import the cabinetry workspace registration."
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
  "useDesignPageCommerceOnboardingRegistration({",
  "useDesignPageCabinetryWorkspaceRegistration({",
  "useDesignPageSelectionWorkspaceRegistration({",
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
  commerceOnboardingSource,
  /useDesignPageOnboardingRegistrationFacade\(\{[\s\S]*?isGuest: !base\.state\.identity\.session\?\.user[\s\S]*?designRoomCount: coreShell\.state\.document\.designSnapshot\.rooms\.length[\s\S]*?planRoomCount: documentRoom\.derived\.plan\.housePlan2D\.rooms\.length[\s\S]*?saveStatusKind: persistence\.state\.persistence\.saveStatus\.kind[\s\S]*?autoCreateSeatingZone:[\s\S]*?editorInteraction\.boundaries\.zone\.actions\.autoCreateSeatingZone[\s\S]*?clampToRoom: documentRoom\.actions\.room\.clampToActiveRoom/,
  "The onboarding registration should retain identity, document, feedback, and room inputs."
);
assert.match(
  onboardingRegistrationSource,
  /useDesignPageOnboarding\(\{[\s\S]*?state,[\s\S]*?actions,[\s\S]*?configuration,[\s\S]*?return \{ state: onboardingState \};/,
  "The onboarding facade should delegate the grouped contract and return only state."
);

assert.match(
  cabinetryWorkspaceSource,
  /useDesignPageCabinetryRegistrationFacade\(\{[\s\S]*?activeRoom: activeRoom \?\? null[\s\S]*?planRoomById: sceneRoomRead\.derived\.scene\.houseRoomById[\s\S]*?activeSurfaceTarget: viewportShell\.state\.surface\.activeSurfaceTarget[\s\S]*?selectedWallFaceId:[\s\S]*?sceneRoomRead\.derived\.room\.activeSelectedWallFaceId[\s\S]*?commitItemsToRoom: itemDocument\.actions\.commitItemsToRoom[\s\S]*?clampToCatalogPlacementRoom:[\s\S]*?placement\.actions\.catalog\.clampToCatalogPlacementRoom/,
  "The cabinetry registration should retain room, surface, ref, placement, and document inputs."
);
assert.match(
  cabinetryRegistrationSource,
  /const activePlanRoom =[\s\S]*?planRoomById\.get\(cabinetryState\.activeRoom\.id\)[\s\S]*?activeSurfaceTarget === "selected_wall" \? selectedWallFaceId : null;/,
  "The cabinetry facade should preserve active-plan-room and preferred-wall derivation."
);

assert.ok(commerceOnboardingSource.split("\n").length <= 180);
assert.ok(cabinetryWorkspaceSource.split("\n").length <= 160);
assert.ok(workspaceSource.split("\n").length <= 1600);
assert.match(
  cabinetryRegistrationSource,
  /targetRef\.current = nextItems;[\s\S]*?useDesignPageCabinetry\(\{[\s\S]*?getDesignSnapshot:\s*\(\) => refs\.designSnapshot\.current[\s\S]*?replaceActiveItemsSnapshot\(refs\.activeItems, nextItems\);[\s\S]*?actions,[\s\S]*?boundaries:\s*\{ cabinetry \}[\s\S]*?selectedItem:\s*cabinetry\.state\.selected\?\.item \?\? null/,
  "The cabinetry facade should preserve ref bridges, the feature boundary, and selected-item derivation."
);

console.log("Design-page feature registration checks passed.");
