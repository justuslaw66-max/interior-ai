import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { executeSaveCurrentAndStartNewPlan } from "@/lib/useDesignPageNewPlanController";
import type { PreserveCurrentDesignResult } from "@/lib/useDesignPagePersistence";

type FixtureOptions = {
  authenticated?: boolean;
  pending?: boolean;
  initialError?: string | null;
  preserve?: () => Promise<PreserveCurrentDesignResult>;
};

function createFixture({
  authenticated = true,
  pending = true,
  initialError = "previous error",
  preserve,
}: FixtureOptions = {}) {
  const events: string[] = [];
  const inFlight = { current: false };
  let pendingReplacement = pending;
  let starting = false;
  let error: string | null = initialError;
  let preserveCalls = 0;

  const preserveCurrentDesign = preserve
    ? async () => {
        preserveCalls += 1;
        events.push("preserve");
        return preserve();
      }
    : async (): Promise<PreserveCurrentDesignResult> => {
        preserveCalls += 1;
        events.push("preserve");
        return { ok: true, savedDesignId: "saved-design" };
      };

  const run = () =>
    executeSaveCurrentAndStartNewPlan({
      state: {
        hasPendingReplacement: pendingReplacement,
        isAuthenticated: authenticated,
      },
      refs: { inFlight },
      actions: {
        setStarting: (nextStarting) => {
          starting = nextStarting;
          events.push(`starting:${nextStarting}`);
        },
        setError: (nextError) => {
          error = nextError;
          events.push(nextError === null ? "error:null" : `error:${nextError}`);
        },
        preserveCurrentDesign,
        detachCurrentDesignForNewDraft: () => events.push("detach"),
        confirmPendingReplacement: () => {
          events.push("confirm");
          pendingReplacement = false;
        },
        clearHistory: () => events.push("clear-history"),
        clearPlanAnnotations: () => events.push("clear-annotations"),
        requestSignIn: () => events.push("sign-in"),
        showToast: (message) => events.push(`toast:${message}`),
      },
    });

  return {
    events,
    inFlight,
    run,
    get error() {
      return error;
    },
    get pendingReplacement() {
      return pendingReplacement;
    },
    get preserveCalls() {
      return preserveCalls;
    },
    get starting() {
      return starting;
    },
  };
}

async function testUnauthenticatedSignInPrecedesBusyState() {
  const fixture = createFixture({ authenticated: false });

  await fixture.run();

  assert.deepEqual(
    fixture.events,
    ["sign-in"],
    "An unauthenticated request should ask for sign-in before mutating busy or error state."
  );
  assert.equal(fixture.inFlight.current, false);
  assert.equal(fixture.starting, false);
  assert.equal(fixture.error, "previous error");
  assert.equal(fixture.preserveCalls, 0);
  assert.equal(fixture.pendingReplacement, true);
}

async function testPreserveFailureKeepsReplacementPending() {
  const fixture = createFixture({
    preserve: async () => ({ ok: false, error: "Cloud save unavailable." }),
  });

  await fixture.run();

  assert.equal(fixture.pendingReplacement, true);
  assert.equal(
    fixture.error,
    "We couldn't save your current design. Nothing was replaced. Cloud save unavailable."
  );
  assert.equal(fixture.starting, false);
  assert.equal(fixture.inFlight.current, false);
  assert.deepEqual(fixture.events, [
    "starting:true",
    "error:null",
    "preserve",
    "error:We couldn't save your current design. Nothing was replaced. Cloud save unavailable.",
    "starting:false",
  ]);
  for (const destructiveEvent of [
    "detach",
    "confirm",
    "clear-history",
    "clear-annotations",
  ]) {
    assert.ok(
      !fixture.events.includes(destructiveEvent),
      `A failed preserve must not run ${destructiveEvent}.`
    );
  }
}

async function testSuccessfulCallbackOrder() {
  const fixture = createFixture();

  await fixture.run();

  assert.deepEqual(fixture.events, [
    "starting:true",
    "error:null",
    "preserve",
    "detach",
    "confirm",
    "clear-history",
    "clear-annotations",
    "toast:Current design saved. New plan started.",
    "starting:false",
  ]);
  assert.equal(fixture.pendingReplacement, false);
  assert.equal(fixture.error, null);
  assert.equal(fixture.starting, false);
  assert.equal(fixture.inFlight.current, false);
}

async function testSynchronousDuplicateSuppression() {
  let resolvePreserve!: (result: PreserveCurrentDesignResult) => void;
  const preserveResult = new Promise<PreserveCurrentDesignResult>((resolve) => {
    resolvePreserve = resolve;
  });
  const fixture = createFixture({ preserve: () => preserveResult });

  const firstRun = fixture.run();
  const duplicateRun = fixture.run();

  assert.equal(
    fixture.preserveCalls,
    1,
    "The in-flight latch should suppress a second call made in the same tick."
  );
  assert.equal(fixture.inFlight.current, true);
  assert.deepEqual(fixture.events, ["starting:true", "error:null", "preserve"]);

  resolvePreserve({ ok: true, savedDesignId: "saved-design" });
  await Promise.all([firstRun, duplicateRun]);

  assert.equal(fixture.preserveCalls, 1);
  assert.equal(fixture.inFlight.current, false);
  assert.equal(fixture.pendingReplacement, false);
}

const root = process.cwd();
const controllerSource = readFileSync(
  join(root, "lib/useDesignPageNewPlanController.ts"),
  "utf8"
);
const facadeSource = readFileSync(
  join(root, "lib/useDesignPagePersistenceNewPlanFacade.ts"),
  "utf8"
);
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const registrationSource = readFileSync(
  join(root, "lib/useDesignPagePersistenceRegistration.ts"),
  "utf8"
);
const workspaceRegistrationSource = readFileSync(
  join(root, "lib/useDesignPagePersistenceWorkspaceRegistration.ts"),
  "utf8"
);

for (const contract of [
  "DesignPageNewPlanControllerState",
  "DesignPageNewPlanControllerActions",
  "UseDesignPageNewPlanControllerInput",
]) {
  assert.match(
    controllerSource,
    new RegExp(`export type ${contract} =`),
    `${contract} should remain an explicit controller contract.`
  );
}
assert.match(
  controllerSource,
  /export async function executeSaveCurrentAndStartNewPlan\(/
);
assert.match(
  controllerSource,
  /const saveCurrentAndStartNewPlan = useCallback\([\s\S]*?executeSaveCurrentAndStartNewPlan\(/
);
assert.match(
  facadeSource,
  /useDesignPageNewPlanController\(\{[\s\S]*?state:\s*\{[\s\S]*?actions:\s*\{/
);
assert.match(
  registrationSource,
  /useDesignPagePersistenceNewPlanFacade\(\{[\s\S]*?state:\s*\{[\s\S]*?actions:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?refs:\s*\{/
);
assert.match(
  workspaceRegistrationSource,
  /useDesignPagePersistenceRegistration\(\{[\s\S]*?boundaries:\s*\{[\s\S]*?state:\s*\{[\s\S]*?actions:\s*\{[\s\S]*?refs:\s*\{/
);
assert.doesNotMatch(
  workspaceSource,
  /startingNewPlanRef|const saveCurrentAndStartNewPlan = useCallback/,
  "The workspace should delegate the new-plan transaction and duplicate latch to its controller."
);

async function main() {
  await testUnauthenticatedSignInPrecedesBusyState();
  await testPreserveFailureKeepsReplacementPending();
  await testSuccessfulCallbackOrder();
  await testSynchronousDuplicateSuppression();
  console.log("design page new-plan controller guardrails passed");
}

void main();
