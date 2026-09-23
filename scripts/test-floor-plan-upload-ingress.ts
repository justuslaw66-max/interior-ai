import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from "@/lib/bounded-request-body";
import { MAX_FLOOR_PLAN_UPLOAD_BYTES } from "@/lib/floor-plan-imports/validation";

function chunkedRequest(chunks: Uint8Array[]) {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks.shift();
      if (next) controller.enqueue(next);
      else controller.close();
    },
  });
  return new Request("http://localhost/api/floor-plan-imports", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=test" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function main() {
  const accepted = await readBoundedRequestBody(
    chunkedRequest([new Uint8Array([1, 2]), new Uint8Array([3, 4])]),
    4
  );
  assert.deepEqual([...accepted], [1, 2, 3, 4]);

  const noContentLength = chunkedRequest([
    new Uint8Array(10),
    new Uint8Array(10),
    new Uint8Array(10),
  ]);
  assert.equal(noContentLength.headers.has("content-length"), false);
  await assert.rejects(
    () => readBoundedRequestBody(noContentLength, 25),
    (cause: unknown) =>
      cause instanceof RequestBodyTooLargeError && cause.limitBytes === 25
  );
  assert.equal(noContentLength.body?.locked, false, "rejected streams must release their reader");

  let cancellationReason: unknown;
  const cancellableStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(26));
    },
    cancel(reason) {
      cancellationReason = reason;
    },
  });
  const cancellableRequest = new Request(
    "http://localhost/api/floor-plan-imports",
    {
      method: "POST",
      body: cancellableStream,
      duplex: "half",
    } as RequestInit & { duplex: "half" }
  );
  await assert.rejects(
    () => readBoundedRequestBody(cancellableRequest, 25),
    RequestBodyTooLargeError
  );
  assert.ok(
    cancellationReason instanceof RequestBodyTooLargeError,
    "crossing the limit must cancel the upstream request stream with the original error"
  );
  assert.equal(cancellableStream.locked, false);

  const streamFailure = new Error("synthetic ingress failure");
  const failedStream = new ReadableStream<Uint8Array>({
    pull() {
      throw streamFailure;
    },
  });
  const failedRequest = new Request("http://localhost/api/floor-plan-imports", {
    method: "POST",
    body: failedStream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  await assert.rejects(
    () => readBoundedRequestBody(failedRequest, 25),
    (cause: unknown) => cause === streamFailure
  );
  assert.equal(failedStream.locked, false, "failed streams must also release their reader");

  // Exercise the same native multipart parser used by the route at the exact
  // accepted file limit. Multipart framing is intentionally bounded
  // separately, leaving room for headers and the privacy field.
  const exactLimitPdf = new Uint8Array(MAX_FLOOR_PLAN_UPLOAD_BYTES);
  exactLimitPdf.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const validForm = new FormData();
  validForm.append(
    "file",
    new Blob([exactLimitPdf], { type: "application/pdf" }),
    "exact-limit.pdf"
  );
  validForm.append("trainingBenchmarkOptIn", "false");
  const validRequest = new Request("http://localhost/api/floor-plan-imports", {
    method: "POST",
    body: validForm,
  });
  const validContentType = validRequest.headers.get("content-type");
  assert.ok(validContentType?.startsWith("multipart/form-data; boundary="));
  const validBody = await readBoundedRequestBody(
    validRequest,
    MAX_FLOOR_PLAN_UPLOAD_BYTES + 1_000_000
  );
  assert.ok(validBody.byteLength > MAX_FLOOR_PLAN_UPLOAD_BYTES);
  const reparsedBody = new ArrayBuffer(validBody.byteLength);
  new Uint8Array(reparsedBody).set(validBody);
  const reparsedRequest = new Request(validRequest.url, {
    method: "POST",
    headers: { "content-type": validContentType! },
    body: reparsedBody,
  });
  const reparsedForm = await reparsedRequest.formData();
  const reparsedFile = reparsedForm.get("file");
  assert.ok(reparsedFile instanceof File);
  assert.equal(reparsedFile.size, MAX_FLOOR_PLAN_UPLOAD_BYTES);
  assert.equal(reparsedFile.name, "exact-limit.pdf");

  const routeSource = fs.readFileSync(
    path.join(process.cwd(), "app/api/floor-plan-imports/route.ts"),
    "utf8"
  );
  assert.match(routeSource, /readBoundedRequestBody\(/);
  assert.doesNotMatch(
    routeSource,
    /await\s+request\.formData\(\)/,
    "multipart parsing must only run after the streaming ingress bound"
  );
  assert.ok(
    routeSource.indexOf("readBoundedRequestBody(") <
      routeSource.indexOf("boundedRequest.formData()"),
    "the hard byte bound must run before multipart parsing"
  );
  assert.ok(
    routeSource.indexOf("upload.size > MAX_FLOOR_PLAN_UPLOAD_BYTES") <
      routeSource.indexOf("upload.arrayBuffer()"),
    "the file-size limit must run before hashing or storage bytes are materialized"
  );
  assert.ok(
    routeSource.indexOf("upload.arrayBuffer()") <
      routeSource.indexOf("store.prepareSource"),
    "validated upload bytes must be materialized before storage"
  );
  assert.match(
    routeSource,
    /headers:\s*\{\s*"content-type": contentType\s*\}/,
    "the buffered parser request must not inherit client Content-Length or transfer headers"
  );

  console.log("Floor-plan upload ingress tests passed");
}

void main();
