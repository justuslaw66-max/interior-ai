export type DesignPageCloudWriteKind =
  | "create"
  | "update"
  | "recovery_copy";

export type DesignPageCloudWriteContext = {
  designId: string | null;
  revision: string | null;
  documentEpoch: number;
  persistenceEpoch: number;
};

export type DesignPageCloudWriteBinding = DesignPageCloudWriteContext & {
  requestId: number;
  kind: DesignPageCloudWriteKind;
  fingerprint: string;
};

export type DesignPageCloudWriteRequestIdentity = Pick<
  DesignPageCloudWriteBinding,
  "persistenceEpoch" | "requestId"
>;

export type DesignPageCloudWriteExecution<T> =
  | { status: "completed"; binding: DesignPageCloudWriteBinding; value: T }
  | {
      status: "stale";
      binding: DesignPageCloudWriteBinding;
      phase: "before_start";
    };

export type DesignPageCloudWriteSuccessDisposition =
  | "accepted"
  | "superseded"
  | "stale";

type CloudWriteIdentity = {
  designId: string;
  revision: string;
  documentEpoch?: number;
};

function contextsMatch(
  binding: DesignPageCloudWriteBinding,
  current: DesignPageCloudWriteContext
): boolean {
  return binding.designId === current.designId &&
    binding.revision === current.revision &&
    binding.documentEpoch === current.documentEpoch &&
    binding.persistenceEpoch === current.persistenceEpoch;
}

export class DesignPageCloudWriteQueue {
  private current: DesignPageCloudWriteContext;
  private nextRequestId = 0;
  private latestRequestId = 0;
  private lastCommittedRequestId = 0;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    initial: Omit<DesignPageCloudWriteContext, "persistenceEpoch"> & {
      persistenceEpoch?: number;
    }
  ) {
    this.current = {
      ...initial,
      persistenceEpoch: initial.persistenceEpoch ?? 0,
    };
  }

  bind(input: {
    kind: DesignPageCloudWriteKind;
    fingerprint: string;
  }): DesignPageCloudWriteBinding {
    const binding = {
      ...this.current,
      requestId: ++this.nextRequestId,
      kind: input.kind,
      fingerprint: input.fingerprint,
    };
    this.latestRequestId = binding.requestId;
    return binding;
  }

  private canStart(binding: DesignPageCloudWriteBinding): boolean {
    return contextsMatch(binding, this.current) &&
      binding.requestId === this.latestRequestId;
  }

  enqueue<T>(
    binding: DesignPageCloudWriteBinding,
    operation: (bound: DesignPageCloudWriteBinding) => Promise<T>
  ): Promise<DesignPageCloudWriteExecution<T>> {
    const queued = this.tail
      .catch(() => undefined)
      .then(async (): Promise<DesignPageCloudWriteExecution<T>> => {
        if (!this.canStart(binding)) {
          return { status: "stale", binding, phase: "before_start" };
        }
        return { status: "completed", binding, value: await operation(binding) };
      });
    this.tail = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  settleSuccess(
    binding: DesignPageCloudWriteBinding,
    identity: CloudWriteIdentity
  ): DesignPageCloudWriteSuccessDisposition {
    if (
      !contextsMatch(binding, this.current) ||
      binding.requestId <= this.lastCommittedRequestId ||
      (binding.kind === "update" && binding.designId !== identity.designId)
    ) return "stale";
    const disposition = binding.requestId === this.latestRequestId
      ? "accepted"
      : "superseded";
    this.current = {
      designId: identity.designId,
      revision: identity.revision,
      documentEpoch: identity.documentEpoch ?? binding.documentEpoch,
      persistenceEpoch: binding.persistenceEpoch,
    };
    this.lastCommittedRequestId = binding.requestId;
    return disposition;
  }

  rebindLatestObsoleteWrite(
    binding: DesignPageCloudWriteBinding
  ): DesignPageCloudWriteBinding | null {
    const isLatestRequest = binding.requestId === this.latestRequestId;
    const isCurrentEpoch =
      binding.documentEpoch === this.current.documentEpoch &&
      binding.persistenceEpoch === this.current.persistenceEpoch;
    const followsSameDesign = binding.designId === this.current.designId;
    const followsCreatedDesign =
      binding.kind === "create" &&
      binding.designId === null &&
      this.current.designId !== null;
    if (
      !isLatestRequest ||
      !isCurrentEpoch ||
      (!followsSameDesign && !followsCreatedDesign)
    ) return null;
    return this.bind({
      kind: followsCreatedDesign ? "update" : binding.kind,
      fingerprint: binding.fingerprint,
    });
  }

  failureIsCurrent(binding: DesignPageCloudWriteBinding): boolean {
    return contextsMatch(binding, this.current) &&
      binding.requestId === this.latestRequestId &&
      binding.requestId > this.lastCommittedRequestId;
  }

  requestIdentityIsLatest(
    request: DesignPageCloudWriteRequestIdentity
  ): boolean {
    return request.persistenceEpoch === this.current.persistenceEpoch &&
      request.requestId === this.latestRequestId;
  }

  requestIsLatest(binding: DesignPageCloudWriteBinding): boolean {
    return this.requestIdentityIsLatest(binding);
  }

  invalidate(replacement?: {
    designId: string | null;
    revision: string | null;
    documentEpoch: number;
  }): DesignPageCloudWriteContext {
    this.current = {
      designId: replacement ? replacement.designId : this.current.designId,
      revision: replacement ? replacement.revision : this.current.revision,
      documentEpoch: replacement
        ? replacement.documentEpoch
        : this.current.documentEpoch,
      persistenceEpoch: this.current.persistenceEpoch + 1,
    };
    this.latestRequestId = 0;
    this.lastCommittedRequestId = 0;
    return this.getCurrent();
  }

  installIdentity(identity: {
    designId: string | null;
    revision: string | null;
    documentEpoch: number;
  }): void {
    this.current = { ...this.current, ...identity };
  }

  getCurrent(): DesignPageCloudWriteContext {
    return { ...this.current };
  }
}

export function createDesignPageCloudWriteQueue(
  initial: ConstructorParameters<typeof DesignPageCloudWriteQueue>[0]
): DesignPageCloudWriteQueue {
  return new DesignPageCloudWriteQueue(initial);
}
