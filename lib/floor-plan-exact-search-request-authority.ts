import type { FloorPlanExactSearchRequest } from "@/lib/floor-plan-directory-contract";

export type FloorPlanExactSearchRequestPurpose =
  | "initial"
  | "load-more"
  | "application"
  | "authored-variant";

export type FloorPlanExactSearchRequestBinding = {
  purpose: FloorPlanExactSearchRequestPurpose;
  identity: string;
  cursor?: string;
  resultSetIdentity?: string;
  resultId?: string;
  selectedRevisionId?: string;
  requestedVariantRevisionId?: string;
};

export type FloorPlanExactSearchRequestToken = {
  binding: FloorPlanExactSearchRequestBinding;
  generation: number;
  requestId: number;
  signal: AbortSignal;
};

type ActiveRequest = {
  controller: AbortController;
  token: FloorPlanExactSearchRequestToken;
};

function bindingsMatch(
  left: FloorPlanExactSearchRequestBinding,
  right: FloorPlanExactSearchRequestBinding
) {
  return left.purpose === right.purpose &&
    left.identity === right.identity &&
    left.cursor === right.cursor &&
    left.resultSetIdentity === right.resultSetIdentity &&
    left.resultId === right.resultId &&
    left.selectedRevisionId === right.selectedRevisionId &&
    left.requestedVariantRevisionId === right.requestedVariantRevisionId;
}

export function createFloorPlanExactSearchIdentity(
  request: FloorPlanExactSearchRequest
) {
  return JSON.stringify([
    request.countryCode,
    request.address.normalizedText,
    request.unit.floor,
    request.unit.stack,
  ]);
}

export class FloorPlanExactSearchRequestAuthority {
  private activeIdentity: string | null = null;
  private generation = 0;
  private requestId = 0;
  private readonly activeRequests = new Map<
    FloorPlanExactSearchRequestPurpose,
    ActiveRequest
  >();

  activate(identity: string) {
    this.abortAll();
    this.generation += 1;
    this.activeIdentity = identity;
  }

  invalidate() {
    this.abortAll();
    this.generation += 1;
    this.activeIdentity = null;
  }

  begin(
    binding: FloorPlanExactSearchRequestBinding
  ): FloorPlanExactSearchRequestToken | null {
    if (binding.identity !== this.activeIdentity) return null;
    const current = this.activeRequests.get(binding.purpose);
    if (
      binding.purpose === "load-more" &&
      current &&
      bindingsMatch(current.token.binding, binding) &&
      !current.controller.signal.aborted
    ) {
      return null;
    }
    current?.controller.abort();
    const controller = new AbortController();
    const token = {
      binding,
      generation: this.generation,
      requestId: ++this.requestId,
      signal: controller.signal,
    };
    this.activeRequests.set(binding.purpose, { controller, token });
    return token;
  }

  isCurrent(
    token: FloorPlanExactSearchRequestToken,
    binding: FloorPlanExactSearchRequestBinding
  ) {
    const current = this.activeRequests.get(token.binding.purpose);
    return !token.signal.aborted &&
      token.generation === this.generation &&
      token.binding.identity === this.activeIdentity &&
      current?.token.requestId === token.requestId &&
      bindingsMatch(token.binding, binding);
  }

  finish(token: FloorPlanExactSearchRequestToken) {
    const current = this.activeRequests.get(token.binding.purpose);
    if (current?.token.requestId !== token.requestId) return;
    this.activeRequests.delete(token.binding.purpose);
  }

  cancel(token: FloorPlanExactSearchRequestToken) {
    const current = this.activeRequests.get(token.binding.purpose);
    if (current?.token.requestId !== token.requestId) return;
    current.controller.abort();
    this.activeRequests.delete(token.binding.purpose);
  }

  abortPurpose(purpose: FloorPlanExactSearchRequestPurpose) {
    const current = this.activeRequests.get(purpose);
    current?.controller.abort();
    this.activeRequests.delete(purpose);
  }

  dispose() {
    this.invalidate();
  }

  private abortAll() {
    for (const request of this.activeRequests.values()) {
      request.controller.abort();
    }
    this.activeRequests.clear();
  }
}
