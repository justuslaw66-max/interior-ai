import type { legacyApiToSnapshot } from "@/lib/room-persistence";

const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;

export type DesignApiErrorKind =
  | "aborted"
  | "offline"
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "invalid_response"
  | "server";

export class DesignApiError extends Error {
  constructor(
    message: string,
    readonly kind: DesignApiErrorKind,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly operationId: string | null = null
  ) {
    super(message);
    this.name = "DesignApiError";
  }
}

export type SavedDesignTransport = {
  id: string;
  title: string;
  createdAt: string;
};

export type LoadedDesignTransport = Parameters<typeof legacyApiToSnapshot>[0] & {
  shareEnabled?: boolean;
  shareToken?: string | null;
  updatedAt?: string;
};

type SaveDesignTransport = { id: string; updatedAt: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function errorKindForStatus(status: number): DesignApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  return "server";
}

function safeMessageForStatus(status: number, body: unknown) {
  if (isRecord(body) && typeof body.error === "string" && body.error.length <= 240) {
    return body.error;
  }
  if (status === 401) return "Sign in to continue.";
  if (status === 403) return "You do not have access to this action.";
  if (status === 404) return "The design could not be found.";
  if (status === 409) return "This design changed elsewhere. Reload before saving again.";
  if (status === 429) return "Too many requests. Please try again shortly.";
  return "The server could not complete the request.";
}

function createAbortContext(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  if (signal?.aborted) controller.abort(signal.reason);
  const timer = window.setTimeout(() => controller.abort("timeout"), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

async function fetchJson<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
    validate: (value: unknown) => T | null;
  }
): Promise<T> {
  const method = options.method ?? "GET";
  const attempts = method === "GET" ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new DesignApiError("You appear to be offline.", "offline", null, true);
    }
    const abortContext = createAbortContext(options.signal);
    try {
      const response = await fetch(path, {
        method,
        headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: abortContext.signal,
      });
      const operationId = response.headers.get("x-operation-id");
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw new DesignApiError(
          "The server returned an unexpectedly large response.",
          "invalid_response",
          response.status,
          false,
          operationId
        );
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        throw new DesignApiError(
          "The server returned an unexpectedly large response.",
          "invalid_response",
          response.status,
          false,
          operationId
        );
      }
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text) as unknown;
        } catch {
          throw new DesignApiError(
            "The server returned an invalid response.",
            "invalid_response",
            response.status,
            false,
            operationId
          );
        }
      }
      if (!response.ok) {
        const retryable = response.status >= 500 || response.status === 429;
        if (method === "GET" && retryable && attempt + 1 < attempts) continue;
        throw new DesignApiError(
          safeMessageForStatus(response.status, json),
          errorKindForStatus(response.status),
          response.status,
          retryable,
          operationId
        );
      }
      const parsed = options.validate(json);
      if (parsed === null) {
        throw new DesignApiError(
          "The server returned an invalid response.",
          "invalid_response",
          response.status,
          false,
          operationId
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof DesignApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DesignApiError(
          options.signal?.aborted ? "Request cancelled." : "The request timed out.",
          "aborted",
          null,
          !options.signal?.aborted
        );
      }
      if (method === "GET" && attempt + 1 < attempts && !options.signal?.aborted) continue;
      throw new DesignApiError("Unable to reach the server.", "network", null, true);
    } finally {
      abortContext.dispose();
    }
  }
  throw new DesignApiError("Unable to reach the server.", "network", null, true);
}

function validateLoadedDesign(value: unknown): LoadedDesignTransport | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.id) ||
    typeof value.roomWidth !== "number" ||
    !Number.isFinite(value.roomWidth) ||
    typeof value.roomDepth !== "number" ||
    !Number.isFinite(value.roomDepth) ||
    !Array.isArray(value.items)
  ) return null;
  return value as LoadedDesignTransport;
}

function validateSavedDesign(value: unknown): SaveDesignTransport | null {
  if (!isRecord(value) || !isNonEmptyString(value.id)) return null;
  return {
    id: value.id,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

function validateShare(value: unknown): { shareToken: string; shareEnabled?: boolean } | null {
  if (!isRecord(value) || !isNonEmptyString(value.shareToken)) return null;
  return {
    shareToken: value.shareToken,
    shareEnabled: typeof value.shareEnabled === "boolean" ? value.shareEnabled : undefined,
  };
}

export const designApi = {
  get(id: string, signal?: AbortSignal) {
    return fetchJson(`/api/designs/${encodeURIComponent(id)}`, {
      signal,
      validate: validateLoadedDesign,
    });
  },
  list(signal?: AbortSignal) {
    return fetchJson("/api/designs", {
      signal,
      validate(value) {
        if (!Array.isArray(value)) return null;
        const parsed = value.filter((entry): entry is SavedDesignTransport =>
          isRecord(entry) &&
          isNonEmptyString(entry.id) &&
          typeof entry.title === "string" &&
          typeof entry.createdAt === "string"
        );
        return parsed.length === value.length ? parsed : null;
      },
    });
  },
  create(payload: unknown, signal?: AbortSignal) {
    return fetchJson("/api/designs", {
      method: "POST",
      body: payload,
      signal,
      validate: validateSavedDesign,
    });
  },
  update(id: string, payload: unknown, signal?: AbortSignal) {
    return fetchJson(`/api/designs/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: payload,
      signal,
      validate: validateSavedDesign,
    });
  },
  delete(id: string, signal?: AbortSignal) {
    return fetchJson(`/api/designs/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal,
      validate(value) {
        return isRecord(value) && value.ok === true ? true : null;
      },
    });
  },
  share(id: string, signal?: AbortSignal) {
    return fetchJson(`/api/designs/${encodeURIComponent(id)}/share`, {
      method: "POST",
      signal,
      validate: validateShare,
    });
  },
  claim(payload: unknown, signal?: AbortSignal) {
    return fetchJson("/api/designs/claim", {
      method: "POST",
      body: payload,
      signal,
      validate(value) {
        if (!isRecord(value) || !isNonEmptyString(value.designId)) return null;
        return { designId: value.designId };
      },
    });
  },
};
