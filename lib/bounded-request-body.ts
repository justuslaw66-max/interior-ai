export class RequestBodyTooLargeError extends Error {
  readonly limitBytes: number;

  constructor(limitBytes: number) {
    super(`Request body exceeds the ${limitBytes} byte limit`);
    this.name = "RequestBodyTooLargeError";
    this.limitBytes = limitBytes;
  }
}

export class InvalidRequestJsonObjectError extends Error {
  constructor() {
    super("Request body must be a JSON object");
    this.name = "InvalidRequestJsonObjectError";
  }
}

/**
 * Reads a web request stream with a hard upper bound. Unlike Request.formData(),
 * this stops accepting chunks as soon as the configured ingress limit is
 * crossed, so a missing or forged Content-Length cannot cause unbounded
 * multipart buffering.
 */
export async function readBoundedRequestBody(
  request: Request,
  limitBytes: number
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0) {
    throw new Error("Request body limit must be a positive safe integer");
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      byteLength += value.byteLength;
      if (byteLength > limitBytes) {
        throw new RequestBodyTooLargeError(limitBytes);
      }
      chunks.push(value);
    }
  } catch (cause) {
    // Rejection must stop the upstream HTTP body as well as our own buffering.
    // Preserve the original error if an underlying stream refuses cancellation.
    await reader.cancel(cause).catch(() => undefined);
    throw cause;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Parses a JSON object only after the streaming byte limit has been enforced.
 * Route handlers intentionally translate this generic error into their own
 * public error language.
 */
export async function readBoundedJsonObject(
  request: Request,
  limitBytes: number
): Promise<Record<string, unknown>> {
  const body = await readBoundedRequestBody(request, limitBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new InvalidRequestJsonObjectError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidRequestJsonObjectError();
  }
  return parsed as Record<string, unknown>;
}
