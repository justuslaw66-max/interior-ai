export type ConflictCopyAuthority = {
  routeDesignId: string | null;
  visibleDesignId: string | null;
  revision: string | null;
  documentFingerprint: string;
  documentEpoch: number;
  persistenceEpoch: number;
  routeIdentity: string;
};

export type ConflictCopyOperation = Readonly<{
  id: number;
  conflictKey: string;
  sourceDesignId: string;
  sourceRevision: string | null;
  documentFingerprint: string;
  documentEpoch: number;
  persistenceEpoch: number;
  lifecycleEpoch: number;
  startRouteIdentity: string;
  startedAt: number;
  signal: AbortSignal;
}>;

export type CreatedConflictCopyIdentity = {
  designId: string;
  revision: string;
};

export type ConflictCopyRouteSnapshot = {
  designId: string | null;
  identity: string;
};

export type ConflictCopyRouteActions = {
  readDesignRoute: () => ConflictCopyRouteSnapshot;
  replaceDesignRoute: (
    route: ConflictCopyRouteSnapshot,
    designId: string,
  ) => void;
  restoreDesignRoute: (
    route: ConflictCopyRouteSnapshot,
    copiedDesignId: string,
  ) => void;
};

export type ConflictCopyTransitionResult =
  | { status: "activated"; copy: CreatedConflictCopyIdentity }
  | { status: "duplicate" }
  | { status: "superseded"; copyCreated: boolean }
  | {
      status: "failed" | "copy_created_not_activated";
      phase: "create" | "validate" | "preflight" | "route" | "commit";
      error: unknown;
    };

export function replaceDesignIdInRouteIdentity(
  routeIdentity: string,
  designId: string,
): string {
  const url = new URL(routeIdentity, "http://design-route.local");
  url.searchParams.set("designId", designId);
  return `${url.pathname}${url.search}${url.hash}`;
}

type OperationStart = {
  conflictKey: string;
  authority: ConflictCopyAuthority;
  now?: number;
};

export type ConflictCopyOperationCoordinator = ReturnType<
  typeof createConflictCopyOperationCoordinator
>;

export function createConflictCopyOperationCoordinator() {
  let nextId = 0;
  let lifecycleEpoch = 0;
  let current: (ConflictCopyOperation & { controller: AbortController }) | null = null;

  return {
    begin({ conflictKey, authority, now = Date.now() }: OperationStart) {
      if (
        current &&
        current.conflictKey === conflictKey &&
        current.sourceDesignId === authority.visibleDesignId
      ) return null;
      current?.controller.abort("superseded");
      const controller = new AbortController();
      const operation = {
        id: ++nextId,
        conflictKey,
        sourceDesignId: authority.visibleDesignId ?? "",
        sourceRevision: authority.revision,
        documentFingerprint: authority.documentFingerprint,
        documentEpoch: authority.documentEpoch,
        persistenceEpoch: authority.persistenceEpoch,
        lifecycleEpoch,
        startRouteIdentity: authority.routeIdentity,
        startedAt: now,
        signal: controller.signal,
        controller,
      };
      current = operation;
      return operation;
    },
    isCurrent(operation: ConflictCopyOperation) {
      return current?.id === operation.id &&
        operation.lifecycleEpoch === lifecycleEpoch;
    },
    invalidate() {
      lifecycleEpoch += 1;
      current?.controller.abort("cancelled");
      current = null;
    },
    invalidateIfSourceChanged(designId: string | null) {
      if (current && current.sourceDesignId !== designId) this.invalidate();
    },
    invalidateIfAuthorityChanged(authority: ConflictCopyAuthority) {
      if (current && !operationOwnsAuthority(current, authority)) this.invalidate();
    },
    finish(operation: ConflictCopyOperation) {
      if (current?.id === operation.id) current = null;
    },
  };
}

function operationOwnsAuthority(
  operation: ConflictCopyOperation,
  authority: ConflictCopyAuthority,
): boolean {
  return authority.routeDesignId === operation.sourceDesignId &&
    authority.visibleDesignId === operation.sourceDesignId &&
    authority.revision === operation.sourceRevision &&
    authority.documentFingerprint === operation.documentFingerprint &&
    authority.documentEpoch === operation.documentEpoch &&
    authority.persistenceEpoch === operation.persistenceEpoch;
}

function normalizeCreatedCopy(
  value: { id: string; updatedAt: string | null },
  sourceDesignId: string,
): CreatedConflictCopyIdentity | null {
  const designId = value.id.trim();
  const revision = value.updatedAt?.trim() ?? "";
  if (
    !designId ||
    designId === sourceDesignId ||
    !revision ||
    !Number.isFinite(Date.parse(revision))
  ) return null;
  return { designId, revision };
}

type TransitionAdapters<TSnapshot, TRoute> = {
  readAuthority: () => ConflictCopyAuthority;
  readRoute: () => TRoute & { designId: string | null };
  createCopy: (
    operation: ConflictCopyOperation,
  ) => Promise<{ id: string; updatedAt: string | null }>;
  preflight: (
    snapshot: TSnapshot,
    copy: CreatedConflictCopyIdentity,
    operation: ConflictCopyOperation,
  ) => boolean;
  replaceRoute: (route: TRoute, copyDesignId: string) => void;
  restoreRoute: (route: TRoute, copyDesignId: string) => void;
  commit: (
    snapshot: TSnapshot,
    copy: CreatedConflictCopyIdentity,
    operation: ConflictCopyOperation,
  ) => boolean;
  restore: (snapshot: TSnapshot) => void;
  publish: (
    copy: CreatedConflictCopyIdentity,
    operation: ConflictCopyOperation,
  ) => void;
};

type RunTransitionInput<TSnapshot, TRoute> = {
  coordinator: ConflictCopyOperationCoordinator;
  operation: ConflictCopyOperation;
  snapshot: TSnapshot;
  adapters: TransitionAdapters<TSnapshot, TRoute>;
};

function superseded(copyCreated: boolean): ConflictCopyTransitionResult {
  return { status: "superseded", copyCreated };
}

function restoreRejectedCommit<TSnapshot, TRoute>(input: {
  snapshot: TSnapshot;
  route: TRoute;
  copyDesignId: string;
  adapters: Pick<
    TransitionAdapters<TSnapshot, TRoute>,
    "restore" | "restoreRoute"
  >;
}) {
  let restoreError: unknown = null;
  try {
    input.adapters.restore(input.snapshot);
  } catch (error) {
    restoreError = error;
  }
  try {
    input.adapters.restoreRoute(input.route, input.copyDesignId);
  } catch (error) {
    restoreError ??= error;
  }
  return restoreError;
}

function transitionIsCurrent<TSnapshot, TRoute>(
  input: RunTransitionInput<TSnapshot, TRoute>,
) {
  return input.coordinator.isCurrent(input.operation) &&
    operationOwnsAuthority(
      input.operation,
      input.adapters.readAuthority(),
    );
}

type PreparedCopy =
  | { status: "ready"; copy: CreatedConflictCopyIdentity }
  | { status: "result"; result: ConflictCopyTransitionResult };

async function createCurrentCopy<TSnapshot, TRoute>(
  input: RunTransitionInput<TSnapshot, TRoute>,
): Promise<PreparedCopy> {
  if (!input.operation.sourceDesignId || !transitionIsCurrent(input)) {
    return { status: "result", result: superseded(false) };
  }
  let transport: { id: string; updatedAt: string | null };
  try {
    transport = await input.adapters.createCopy(input.operation);
  } catch (error) {
    const result = input.coordinator.isCurrent(input.operation)
      ? { status: "failed" as const, phase: "create" as const, error }
      : superseded(false);
    return { status: "result", result };
  }
  if (!transitionIsCurrent(input)) {
    return { status: "result", result: superseded(true) };
  }
  const copy = normalizeCreatedCopy(transport, input.operation.sourceDesignId);
  return copy
    ? { status: "ready", copy }
    : {
        status: "result",
        result: {
          status: "copy_created_not_activated",
          phase: "validate",
          error: new Error("The cloud copy returned an invalid identity or revision."),
        },
      };
}

function preflightCurrentCopy<TSnapshot, TRoute>(
  input: RunTransitionInput<TSnapshot, TRoute>,
  copy: CreatedConflictCopyIdentity,
): ConflictCopyTransitionResult | null {
  try {
    if (!input.adapters.preflight(input.snapshot, copy, input.operation)) {
      return {
        status: "copy_created_not_activated",
        phase: "preflight",
        error: new Error("The cloud copy could not establish a local baseline."),
      };
    }
  } catch (error) {
    return { status: "copy_created_not_activated", phase: "preflight", error };
  }
  return transitionIsCurrent(input) ? null : superseded(true);
}

type ReplacedRoute<TRoute> =
  | { status: "ready"; route: TRoute }
  | { status: "result"; result: ConflictCopyTransitionResult };

function replaceCopyRoute<TSnapshot, TRoute>(
  input: RunTransitionInput<TSnapshot, TRoute>,
  copy: CreatedConflictCopyIdentity,
): ReplacedRoute<TRoute> {
  const route = input.adapters.readRoute();
  if (route.designId !== input.operation.sourceDesignId) {
    return { status: "result", result: superseded(true) };
  }
  try {
    input.adapters.replaceRoute(route, copy.designId);
    return { status: "ready", route };
  } catch (error) {
    try {
      input.adapters.restoreRoute(route, copy.designId);
    } catch {
      // The structured failure retains the original route error for diagnostics.
    }
    return {
      status: "result",
      result: { status: "copy_created_not_activated", phase: "route", error },
    };
  }
}

function commitCopyLocally<TSnapshot, TRoute>(
  input: RunTransitionInput<TSnapshot, TRoute>,
  copy: CreatedConflictCopyIdentity,
  route: TRoute,
): ConflictCopyTransitionResult {
  let commitError: unknown = null;
  try {
    if (!input.coordinator.isCurrent(input.operation) ||
      !input.adapters.commit(input.snapshot, copy, input.operation)) {
      commitError = new Error("The cloud copy local commit was rejected.");
    }
  } catch (error) {
    commitError = error;
  }
  if (commitError) {
    const restoreError = restoreRejectedCommit({
      snapshot: input.snapshot, route, copyDesignId: copy.designId,
      adapters: input.adapters,
    });
    return {
      status: "copy_created_not_activated",
      phase: "commit",
      error: restoreError ?? commitError,
    };
  }
  if (!input.coordinator.isCurrent(input.operation)) {
    restoreRejectedCommit({
      snapshot: input.snapshot, route, copyDesignId: copy.designId,
      adapters: input.adapters,
    });
    return superseded(true);
  }
  input.adapters.publish(copy, input.operation);
  input.coordinator.finish(input.operation);
  return { status: "activated", copy };
}

export async function runConflictCopyTransition<TSnapshot, TRoute>(
  input: RunTransitionInput<TSnapshot, TRoute>,
): Promise<ConflictCopyTransitionResult> {
  const prepared = await createCurrentCopy(input);
  if (prepared.status === "result") return prepared.result;
  const rejected = preflightCurrentCopy(input, prepared.copy);
  if (rejected) return rejected;
  const replaced = replaceCopyRoute(input, prepared.copy);
  return replaced.status === "result"
    ? replaced.result
    : commitCopyLocally(input, prepared.copy, replaced.route);
}
