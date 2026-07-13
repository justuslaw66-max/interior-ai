import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CabinetContextualOnboarding } from "../features/cabinetry/components/CabinetContextualOnboarding";
import {
  CABINET_EXPERIENCE_STORAGE_KEY,
  CABINET_ONBOARDING_ACTIONS,
  CABINET_ONBOARDING_STORAGE_KEY,
  dismissCabinetOnboarding,
  getCabinetOnboardingActionsForStep,
  isCabinetOnboardingDismissed,
  readCabinetExperiencePreference,
  writeCabinetExperiencePreference,
  type CabinetPreferenceStorage,
} from "../features/cabinetry/studioOnboarding";

class MemoryStorage implements CabinetPreferenceStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

assert.deepEqual(
  CABINET_ONBOARDING_ACTIONS.map(({ order, id }) => [order, id]),
  [
    [1, "template"],
    [2, "dimensions"],
    [3, "module"],
    [4, "place"],
    [5, "reopen"],
  ],
  "first-use onboarding must teach exactly the five specified actions in order"
);
assert.deepEqual(
  getCabinetOnboardingActionsForStep("type").map((action) => action.id),
  ["template"]
);
assert.deepEqual(
  getCabinetOnboardingActionsForStep("size").map((action) => action.id),
  ["dimensions"]
);
assert.deepEqual(
  getCabinetOnboardingActionsForStep("layout").map((action) => action.id),
  ["module"]
);
assert.deepEqual(
  getCabinetOnboardingActionsForStep("review").map((action) => action.id),
  ["place", "reopen"]
);
assert.equal(getCabinetOnboardingActionsForStep("space").length, 0);
assert.equal(getCabinetOnboardingActionsForStep("style").length, 0);

const storage = new MemoryStorage();
assert.equal(isCabinetOnboardingDismissed(storage), false);
dismissCabinetOnboarding(storage);
assert.equal(storage.getItem(CABINET_ONBOARDING_STORAGE_KEY), "true");
assert.equal(isCabinetOnboardingDismissed(storage), true);

assert.equal(readCabinetExperiencePreference(storage), null);
writeCabinetExperiencePreference(storage, "detailed");
assert.equal(storage.getItem(CABINET_EXPERIENCE_STORAGE_KEY), "detailed");
assert.equal(readCabinetExperiencePreference(storage), "detailed");
writeCabinetExperiencePreference(storage, "guided");
assert.equal(readCabinetExperiencePreference(storage), "guided");
storage.values.set(CABINET_EXPERIENCE_STORAGE_KEY, "unsupported");
assert.equal(readCabinetExperiencePreference(storage), null);

const unavailableStorage: CabinetPreferenceStorage = {
  getItem() {
    throw new Error("unavailable");
  },
  setItem() {
    throw new Error("unavailable");
  },
};
assert.equal(isCabinetOnboardingDismissed(unavailableStorage), false);
assert.equal(readCabinetExperiencePreference(unavailableStorage), null);
assert.doesNotThrow(() => dismissCabinetOnboarding(unavailableStorage));
assert.doesNotThrow(() =>
  writeCabinetExperiencePreference(unavailableStorage, "detailed")
);

const noop = () => undefined;
const typeHint = renderToStaticMarkup(
  createElement(CabinetContextualOnboarding, {
    step: "type",
    visible: true,
    onDismiss: noop,
    onShow: noop,
  })
);
assert.match(typeHint, /data-testid="cabinet-onboarding-hint"/);
assert.match(typeHint, /1 of 5 · Choose a template/);
assert.match(typeHint, /data-testid="cabinet-onboarding-dismiss"/);

const sizePrompt = renderToStaticMarkup(
  createElement(CabinetContextualOnboarding, {
    step: "size",
    visible: false,
    onDismiss: noop,
    onShow: noop,
  })
);
assert.match(sizePrompt, /data-testid="cabinet-onboarding-size-show"/);
assert.match(sizePrompt, />Show me how</);

const reviewHint = renderToStaticMarkup(
  createElement(CabinetContextualOnboarding, {
    step: "review",
    visible: true,
    onDismiss: noop,
    onShow: noop,
  })
);
assert.match(reviewHint, /4 of 5 · Place it into the room/);
assert.match(reviewHint, /5 of 5 · Reopen it later/);

const spaceHint = renderToStaticMarkup(
  createElement(CabinetContextualOnboarding, {
    step: "space",
    visible: true,
    onDismiss: noop,
    onShow: noop,
  })
);
assert.equal(spaceHint, "", "onboarding must not grow beyond the five taught actions");

const studioSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
for (const step of ["type", "size", "layout", "review"] as const) {
  assert.match(
    studioSource,
    new RegExp(`<CabinetContextualOnboarding\\s+step="${step}"`),
    `${step} must expose its contextual first-use action`
  );
}
assert.match(
  studioSource,
  /readCabinetExperiencePreference\(window\.localStorage\)/,
  "create-mode entry must restore the returning professional's workspace"
);
assert.match(studioSource, /chooseExperienceMode\("detailed"\)/);
assert.match(studioSource, /chooseExperienceMode\("guided"\)/);

console.log("Cabinetry contextual onboarding checks passed.");
