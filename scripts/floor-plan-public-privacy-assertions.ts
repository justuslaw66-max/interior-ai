import assert from "node:assert/strict";

const FORBIDDEN_SELECTOR_KEYS = new Set([
  "stack",
  "stacks",
  "floorMin",
  "floorMax",
  "floorRange",
  "floorStart",
  "floorEnd",
  "unitFloor",
  "unitStack",
  "unitNumber",
  "unitQuery",
  "unitMatches",
  "exactUnit",
  "exactUnits",
  "addressBindingSelectors",
  "bindingSelectors",
  "selectorRanges",
]);

export function assertPublicFloorPlanProjectionSafe(value: unknown) {
  const visit = (entry: unknown): void => {
    if (!entry || typeof entry !== "object") return;
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    for (const [key, nested] of Object.entries(entry)) {
      assert.equal(
        FORBIDDEN_SELECTOR_KEYS.has(key),
        false,
        `Public floor-plan projection exposed ${key}`
      );
      visit(nested);
    }
  };
  visit(value);
}

export function assertPublicFloorPlanSentinelsAbsent(
  value: unknown,
  sentinels: ReadonlyArray<string | number>
) {
  const serialized = JSON.stringify(value);
  for (const sentinel of sentinels) {
    assert.equal(
      serialized.includes(String(sentinel)),
      false,
      "Public floor-plan projection exposed a private sentinel"
    );
  }
}
