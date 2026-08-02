import { NextResponse } from "next/server";
import { logOperationalEvent } from "@/lib/observability";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "INTERNAL_ERROR";

export class ApiBoundaryError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApiBoundaryError";
  }
}

export function createOperationId() {
  return crypto.randomUUID();
}

export async function readJsonRequest(
  request: Request,
  maxBytes: number
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      throw new ApiBoundaryError(413, "PAYLOAD_TOO_LARGE", "Request payload is too large.");
    }
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiBoundaryError(413, "PAYLOAD_TOO_LARGE", "Request payload is too large.");
  }
  if (!text.trim()) {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Request body is required.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Request body must be valid JSON.");
  }
}

export function apiErrorResponse(
  error: unknown,
  context: { operation: string; operationId: string; startedAt: number }
) {
  const boundary =
    error instanceof ApiBoundaryError
      ? error
      : new ApiBoundaryError(500, "INTERNAL_ERROR", "The request could not be completed.");
  logOperationalEvent({
    operation: context.operation,
    operationId: context.operationId,
    outcome: "failed",
    durationMs: Date.now() - context.startedAt,
    status: boundary.status,
    errorCode: boundary.code,
  });
  return NextResponse.json(
    {
      error: boundary.message,
      code: boundary.code,
      operationId: context.operationId,
    },
    {
      status: boundary.status,
      headers: { "x-operation-id": context.operationId },
    }
  );
}

export function apiSuccessHeaders(operationId: string) {
  return { "x-operation-id": operationId };
}
