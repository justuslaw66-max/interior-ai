import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ApiBoundaryError, readJsonRequest } from "@/lib/api-boundary";
import { sanitizeObservabilityMeta } from "@/lib/observability";
import {
  parseDesignNotesInput,
  parseDesignNotesOutput,
} from "@/lib/ai/design-notes-contract";
import { validateCabinetSourceImportFile } from "@/features/cabinetry/importPolicy";
import {
  parseDesignClaimPayload,
  parseDesignCreatePayload,
} from "@/lib/design-route-payload";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

async function testRequestBoundary() {
  const parsed = await readJsonRequest(
    new Request("http://localhost/test", { method: "POST", body: '{"ok":true}' }),
    64
  );
  assert.deepEqual(parsed, { ok: true });

  await assert.rejects(
    () => readJsonRequest(
      new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ value: "x".repeat(100) }) }),
      32
    ),
    (error) => error instanceof ApiBoundaryError && error.code === "PAYLOAD_TOO_LARGE"
  );
  await assert.rejects(
    () => readJsonRequest(
      new Request("http://localhost/test", { method: "POST", body: "not-json" }),
      64
    ),
    (error) => error instanceof ApiBoundaryError && error.code === "BAD_REQUEST"
  );
}

function testPrivacySanitization() {
  const safe = sanitizeObservabilityMeta({
    designId: "design-1",
    authorization: "Bearer secret",
    nested: { shareToken: "bearer-token", result: "ok" },
  });
  assert.equal(safe?.designId, "design-1");
  assert.equal(safe?.authorization, "[redacted]");
  assert.deepEqual(safe?.nested, { shareToken: "[redacted]", result: "ok" });
}

function testAiContracts() {
  const input = parseDesignNotesInput({
    design: {
      id: "design-1",
      items: [{ id: "item-1", category: "sofa", price: 1200 }],
      categories: ["sofa"],
      budget: "1200",
    },
    mode: "designer",
  });
  assert.equal(input?.design.items.length, 1);
  assert.equal(input?.mode, "designer");
  assert.equal(
    parseDesignNotesInput({ design: { items: Array.from({ length: 501 }, () => ({})) } }),
    null
  );

  assert.ok(parseDesignNotesOutput({
    summary: ["One", "Two", "Three"],
    rationale: "A bounded rationale.",
    suggestions: [{
      id: "suggestion-1",
      label: "Resize the rug",
      action: { type: "RUG_RESIZE_TO_SOFA" },
    }],
  }));
  assert.equal(parseDesignNotesOutput({ summary: [], rationale: "x", suggestions: [] }), null);
}

function testImportContracts() {
  assert.equal(
    validateCabinetSourceImportFile({ name: "cabinet.json", size: 1024, type: "application/json" }).ok,
    true
  );
  assert.equal(
    validateCabinetSourceImportFile({ name: "cabinet.txt", size: 1024, type: "text/plain" }).ok,
    false
  );
  assert.equal(
    validateCabinetSourceImportFile({ name: "cabinet.json", size: 3 * 1024 * 1024, type: "application/json" }).ok,
    false
  );

  const baseDesign = { roomWidth: 4, roomDepth: 5, items: [] };
  assert.equal(parseDesignCreatePayload(baseDesign).ok, true);
  assert.equal(parseDesignCreatePayload({ ...baseDesign, roomWidth: Number.NaN }).ok, false);
  assert.equal(parseDesignCreatePayload({ ...baseDesign, items: Array.from({ length: 2001 }, () => ({})) }).ok, false);
  assert.equal(parseDesignClaimPayload({
    anonymousId: "not-a-uuid",
    designSnapshot: baseDesign,
  }).ok, false);
}

function testSourceGuards() {
  const designRoute = read("app/api/designs/[id]/route.ts");
  assert.match(designRoute, /findFirst\(\{\s*where: \{ id, userId \}/);
  assert.doesNotMatch(designRoute, /error: String\(/);
  assert.match(designRoute, /NOT_FOUND[\s\S]*Design not found/);

  const confirmRoute = read("app/api/shopify/confirm/route.ts");
  assert.doesNotMatch(confirmRoute, /shopifyOrder\.(create|upsert|update)/);
  assert.doesNotMatch(confirmRoute, /\b(total|currency)\b/);
  assert.match(confirmRoute, /checkout_return_observed/);
  assert.match(confirmRoute, /provider-verified webhook/);

  const clickRoute = read("app/api/track/click/route.ts");
  assert.match(clickRoute, /assertStrictVariantResolution/);
  assert.doesNotMatch(clickRoute, /payload\.(price|retailer|buyUrl)/);
  const conversionRoute = read("app/api/track/event/route.ts");
  assert.match(conversionRoute, /isAdminEmail/);
  assert.match(conversionRoute, /value: null, currency: null/);

  const appEvents = read("lib/app-events.ts");
  assert.match(appEvents, /shareToken: null/);
  assert.match(appEvents, /createHash\("sha256"\)/);

  const persistence = read("lib/useDesignPagePersistence.ts");
  assert.doesNotMatch(persistence, /fetch\(`?\/api\/designs/);
  assert.match(persistence, /designApi\.update/);
  assert.match(persistence, /AbortController/);

  const client = read("lib/design-api-client.ts");
  assert.match(client, /MAX_RESPONSE_BYTES/);
  assert.match(client, /attempts = method === "GET" \? 2 : 1/);

  const cabinetDocumentIO = read(
    "features/cabinetry/infrastructure/CabinetStudioDocumentIO.ts"
  );
  assert.ok(
    cabinetDocumentIO.indexOf("validateCabinetSourceImportFile(file)") <
      cabinetDocumentIO.indexOf("await file.text()")
  );

  const sharedPdf = read("app/share/[shareToken]/export/pdf/route.ts");
  assert.doesNotMatch(sharedPdf, /email: true|user\?\.email/);

  const analyticsSources = ["app", "components", "lib"]
    .flatMap((directory) => walk(path.join(root, directory)))
    .filter((file) => /\.(ts|tsx)$/.test(file));
  for (const file of analyticsSources) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /share_token\s*:/, file);
  }
}

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

async function main() {
  await testRequestBoundary();
  testPrivacySanitization();
  testAiContracts();
  testImportContracts();
  testSourceGuards();
  console.log("Phase 7 security boundary tests passed.");
}

void main();
