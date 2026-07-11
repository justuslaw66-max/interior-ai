import type { AppEventLogResult, AppEventPayload } from "@/lib/app-events";
import { isClientAppEventType } from "@/lib/app-event-contract";

const MAX_CLIENT_EVENT_BODY_BYTES = 32 * 1024;
const MAX_REFERENCE_LENGTH = 128;

type AppEventSession = {
  user?: {
    id?: string | null;
  } | null;
} | null;

type RateLimitResult = {
  ok: boolean;
};

export type ClientAppEventHandlerDependencies = {
  authenticate: () => Promise<AppEventSession>;
  logEvent: (payload: AppEventPayload) => Promise<AppEventLogResult>;
  checkRateLimit: (key: string, limit: number, windowMs: number) => RateLimitResult;
  skipPersistence: boolean;
};

function getClientIp(req: Request) {
  const header = req.headers.get("x-forwarded-for") || "";
  return header.split(",")[0].trim() || "unknown";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedReference(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_REFERENCE_LENGTH) : null;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0].trim() || null;
}

function resolveRequestOrigin(req: Request) {
  const requestUrl = new URL(req.url);
  const host =
    firstHeaderValue(req.headers.get("host")) ??
    firstHeaderValue(req.headers.get("x-forwarded-host"));
  const forwardedProtocol = firstHeaderValue(req.headers.get("x-forwarded-proto"));
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : requestUrl.protocol.replace(/:$/, "");
  if (!host) return requestUrl.origin;

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return requestUrl.origin;
  }
}

async function readBoundedRequestText(req: Request, maxBytes: number) {
  if (!req.body) return { ok: true as const, value: "" };
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let value = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false as const, value: "" };
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    value += decoder.decode();
    return { ok: true as const, value };
  } finally {
    reader.releaseLock();
  }
}

export function createClientAppEventHandler(
  dependencies: ClientAppEventHandlerDependencies,
) {
  return async function handleClientAppEvent(req: Request) {
    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.split(";", 1)[0].trim() !== "application/json") {
      return Response.json(
        { error: "Content-Type must be application/json" },
        { status: 415 },
      );
    }

    const requestOrigin = resolveRequestOrigin(req);
    const suppliedOrigin = req.headers.get("origin");
    if (suppliedOrigin && suppliedOrigin !== requestOrigin) {
      return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }

    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_CLIENT_EVENT_BODY_BYTES) {
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }

    const session = await dependencies.authenticate();
    const key = session?.user?.id
      ? `user:${session.user.id}:app-event`
      : `ip:${getClientIp(req)}:app-event`;
    const rateLimitResult = dependencies.checkRateLimit(key, 30, 60_000);
    if (!rateLimitResult.ok) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const bodyRead = await readBoundedRequestText(req, MAX_CLIENT_EVENT_BODY_BYTES).catch(
      () => ({ ok: true as const, value: "" }),
    );
    if (!bodyRead.ok) {
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }
    const rawBody = bodyRead.value;

    const body = asRecord(
      (() => {
        try {
          return JSON.parse(rawBody) as unknown;
        } catch {
          return null;
        }
      })(),
    );
    const eventType = body?.eventType;

    if (!isClientAppEventType(eventType)) {
      return Response.json({ error: "Invalid eventType" }, { status: 400 });
    }

    if (dependencies.skipPersistence) {
      return Response.json({
        ok: true,
        persisted: false,
        eventId: null,
        skipped: "qa",
      });
    }

    const result = await dependencies.logEvent({
      eventType,
      userId: session?.user?.id ?? null,
      designId: boundedReference(body?.designId),
      shareToken: boundedReference(body?.shareToken),
      meta: asRecord(body?.meta),
    });

    if (!result.persisted || !result.eventId) {
      return Response.json(
        {
          ok: false,
          persisted: false,
          eventId: null,
          error: "Unable to persist app event",
        },
        { status: 503 },
      );
    }

    return Response.json({
      ok: true,
      persisted: true,
      eventId: result.eventId,
    });
  };
}
