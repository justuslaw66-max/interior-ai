import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createDesignPageLoadRequestCoordinator,
} from "@/lib/design-page-requested-design-load-coordinator";
import {
  resolveRequestedDesignLoadCompletion,
  resolveRequestedDesignLoadDecision,
} from "@/lib/useDesignPageRequestedDesignWorkspaceRegistration";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const requestedDesignSource = readSource(
  "lib/useDesignPageRequestedDesignWorkspaceRegistration.ts"
);
const loadCoordinatorSource = readSource(
  "lib/design-page-requested-design-load-coordinator.ts"
);
const persistenceSource = readSource("lib/useDesignPagePersistence.ts");
const cloudLoadSource = readSource("lib/useDesignPageCloudLoadController.ts");

const baseDecision = {
  requestedDesignId: "requested-design",
  currentDesignId: "current-design",
  authenticated: true,
  localBackupHydrated: true,
};

assert.deepEqual(
  resolveRequestedDesignLoadDecision({
    ...baseDecision,
    requestedDesignId: "",
  }),
  { kind: "none" }
);
for (const waitingInput of [
  { authenticated: false, localBackupHydrated: true },
  { authenticated: true, localBackupHydrated: false },
] as const) {
  assert.deepEqual(
    resolveRequestedDesignLoadDecision({ ...baseDecision, ...waitingInput }),
    { kind: "waiting" }
  );
}
assert.deepEqual(
  resolveRequestedDesignLoadDecision({
    ...baseDecision,
    requestedDesignId: "current-design",
  }),
  { kind: "current" }
);
assert.deepEqual(resolveRequestedDesignLoadDecision(baseDecision), {
  kind: "load",
  designId: "requested-design",
});
assert.deepEqual(
  resolveRequestedDesignLoadDecision({
    ...baseDecision,
    currentDesignId: "requested-design",
  }),
  { kind: "current" },
  "A repeated route identity should not start another load."
);

const context = new URLSearchParams(
  "mode=designer&view=2d&workspace=furnish&utm_source=ignored"
);
for (const result of ["loaded", "superseded"] as const) {
  assert.deepEqual(
    resolveRequestedDesignLoadCompletion({
      active: true,
      result,
      currentDesignId: "current-design",
      context,
    }),
    { kind: "unchanged" }
  );
}
assert.deepEqual(
  resolveRequestedDesignLoadCompletion({
    active: false,
    result: "missing",
    currentDesignId: "stale-design",
    context,
  }),
  { kind: "unchanged" },
  "An unmounted or superseded route effect must not restore stale navigation."
);
assert.deepEqual(
  resolveRequestedDesignLoadCompletion({
    active: true,
    result: "missing",
    currentDesignId: "current-design",
    context,
  }),
  {
    kind: "replace",
    href: "/design?designId=current-design&mode=designer&view=2d&workspace=furnish",
  }
);
assert.deepEqual(
  resolveRequestedDesignLoadCompletion({
    active: true,
    result: "unavailable",
    currentDesignId: null,
    context,
  }),
  { kind: "replace", href: "/design" }
);

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function verifyDeferredSupersession() {
  const coordinator = createDesignPageLoadRequestCoordinator();
  const committed: string[] = [];
  const load = async (response: Deferred<string>) => {
    const request = coordinator.start();
    const value = await response.promise;
    if (!coordinator.isCurrent(request)) return "superseded" as const;
    committed.push(value);
    coordinator.finish(request);
    return "loaded" as const;
  };

  const slowA = createDeferred<string>();
  const currentB = createDeferred<string>();
  const loadA = load(slowA);
  const loadB = load(currentB);
  currentB.resolve("design-b");
  assert.equal(await loadB, "loaded");
  slowA.resolve("design-a");
  assert.equal(await loadA, "superseded");
  assert.deepEqual(committed, ["design-b"]);

  const removedRoute = createDeferred<string>();
  const removedLoad = load(removedRoute);
  coordinator.cancel();
  removedRoute.resolve("removed-design");
  assert.equal(await removedLoad, "superseded");
  assert.deepEqual(
    committed,
    ["design-b"],
    "An adapter that ignores abort must not commit after route removal."
  );
}

assert.match(
  workspaceSource,
  /useDesignPagePersistenceWorkspaceRegistration\(\{[\s\S]*?useDesignPageRequestedDesignWorkspaceRegistration\(\{[\s\S]*?persistence: persistenceWorkspaceRegistration/
);
assert.doesNotMatch(workspaceSource, /useEffect\(|searchParams\.get\("designId"\)|loadDesign\(/);
assert.match(
  requestedDesignSource,
  /useEffect\(\(\) => \{[\s\S]*?loadDesign\(decision\.designId\)[\s\S]*?router\.replace\(completion\.href\)/,
  "The route effect should remain ordered after persistence registration."
);
assert.match(
  requestedDesignSource,
  /return \(\) => \{[\s\S]*?active = false;[\s\S]*?cancelDesignLoad\(\)/,
  "Route cleanup should suppress late navigation and invalidate pending loads."
);
assert.match(
  requestedDesignSource,
  /closeMyDesigns\(\);[\s\S]*?router\.push\(buildDesignEditorUrl\(\{ designId, context: searchParams \}\)\)/,
  "My Designs should close before canonical navigation uses the selected ID."
);
assert.doesNotMatch(requestedDesignSource, /useState\(/);
assert.match(
  loadCoordinatorSource,
  /start\(\)[\s\S]*?epoch \+= 1;[\s\S]*?currentController\?\.abort\(\)/,
  "Every new load must claim a unique epoch before aborting its predecessor."
);
assert.match(
  loadCoordinatorSource,
  /cancel\(\)[\s\S]*?epoch \+= 1;[\s\S]*?controller\.abort\(\)/,
  "Cancellation must invalidate adapters even when they ignore abort."
);

assert.match(
  persistenceSource,
  /createDesignPageLoadRequestCoordinator[\s\S]*?requestCoordinator: designLoadRequest/,
  "Persistence should delegate request epochs and abort ownership to the coordinator."
);
assert.match(
  cloudLoadSource,
  /requestCoordinator\.start\(\)[\s\S]*?await designApi\.get\(id, request\.controller\.signal\)[\s\S]*?!input\.requestCoordinator\.isCurrent\(request\)[\s\S]*?return "superseded"/,
  "A response must claim the current request before it can mutate document state."
);
assert.match(
  cloudLoadSource,
  /error\.kind === "forbidden"[\s\S]*?"You do not have access to that design"[\s\S]*?error\.kind === "not_found"[\s\S]*?"Design not found"[\s\S]*?"unavailable"/,
  "Denied, missing, and unavailable loads should retain distinct user-facing errors."
);
assert.match(
  persistenceSource,
  /if \(!localBackupHydrated\) return;[\s\S]*?if \(!designId\) return;[\s\S]*?if \(!localBackupHydrated\) return;/,
  "Local and cloud persistence should remain gated until hydration and identity are ready."
);
assert.match(
  persistenceSource,
  /return \(\) => \{[\s\S]*?designLoadRequest\.cancel\(\)/,
  "Unmount should abort outstanding design work."
);

assert.ok(requestedDesignSource.trimEnd().split("\n").length <= 200);
assert.ok(workspaceSource.trimEnd().split("\n").length <= 543);

void verifyDeferredSupersession().then(() => {
  console.log("design page requested-design workspace registration checks passed");
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
