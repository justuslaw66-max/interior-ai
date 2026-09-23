import type {
  DesignPageCloudWriteBinding,
  DesignPageCloudWriteKind,
  DesignPageCloudWriteQueue,
} from "@/lib/design-page-cloud-write-queue";

type SaveTransport = { id: string; updatedAt: string | null };

type SavedWrite = {
  status: "saved";
  binding: DesignPageCloudWriteBinding;
  designId: string;
  revision: string;
};

type UncommittedWrite =
  | { status: "stale"; binding: DesignPageCloudWriteBinding }
  | { status: "failed"; binding: DesignPageCloudWriteBinding; error: unknown }
  | {
      status: "invalid";
      binding: DesignPageCloudWriteBinding;
      message: string;
    };

export type DesignPageCloudWriteResult = SavedWrite | UncommittedWrite;

type ExecuteCloudWriteInput = {
  queue: DesignPageCloudWriteQueue;
  kind: DesignPageCloudWriteKind;
  fingerprint: string;
  prepare: (
    binding: DesignPageCloudWriteBinding
  ) => () => Promise<SaveTransport>;
  failureIsRelevant?: () => boolean;
  stage?: (write: {
    designId: string;
    revision: string;
    fingerprint: string;
    epoch: number;
    requestId: number;
    persistenceEpoch: number;
  }) => boolean;
};

function invalidWriteResult(
  input: ExecuteCloudWriteInput,
  binding: DesignPageCloudWriteBinding
): UncommittedWrite {
  if (input.failureIsRelevant && !input.failureIsRelevant()) {
    return { status: "stale", binding };
  }
  return input.queue.failureIsCurrent(binding)
    ? {
        status: "invalid",
        binding,
        message: "The cloud response did not include a complete identity.",
      }
    : { status: "stale", binding };
}

function failedWriteResult(
  input: ExecuteCloudWriteInput,
  binding: DesignPageCloudWriteBinding,
  error: unknown
): UncommittedWrite {
  if (input.failureIsRelevant && !input.failureIsRelevant()) {
    return { status: "stale", binding };
  }
  return input.queue.failureIsCurrent(binding)
    ? { status: "failed", binding, error }
    : { status: "stale", binding };
}

export async function executeDesignPageCloudWrite(
  input: ExecuteCloudWriteInput
): Promise<DesignPageCloudWriteResult> {
  let binding = input.queue.bind({
    kind: input.kind,
    fingerprint: input.fingerprint,
  });
  while (true) {
    try {
      const operation = input.prepare(binding);
      const execution = await input.queue.enqueue(binding, operation);
      if (execution.status === "stale") {
        const rebound = input.queue.rebindLatestObsoleteWrite(binding);
        if (!rebound) return { status: "stale", binding };
        binding = rebound;
        continue;
      }
      const designId = execution.value.id.trim();
      const revision = execution.value.updatedAt?.trim() ?? "";
      if (!designId || !revision) return invalidWriteResult(input, binding);
      const disposition = input.queue.settleSuccess(binding, {
        designId,
        revision,
      });
      if (disposition !== "accepted") return { status: "stale", binding };
      if (input.stage && !input.stage({
        designId,
        revision,
        fingerprint: binding.fingerprint,
        epoch: binding.documentEpoch,
        requestId: binding.requestId,
        persistenceEpoch: binding.persistenceEpoch,
      })) return { status: "stale", binding };
      return { status: "saved", binding, designId, revision };
    } catch (error) {
      return failedWriteResult(input, binding, error);
    }
  }
}
