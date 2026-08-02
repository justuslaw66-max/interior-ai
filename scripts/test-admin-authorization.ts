import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  getApplicationEnvironment,
  validateDeploymentEnvironmentOrThrow,
} from "../lib/config";
import { canAccessAdmin, isAdminEmail } from "../lib/admin";
import {
  canPublishPublicFloorPlans,
  canReviewPublicFloorPlans,
} from "../lib/floor-plan-imports/publication-governance";

const ENV_KEYS = [
  "APP_ENV",
  "VERCEL_ENV",
  "NEXT_PUBLIC_APP_ENV",
  "ADMIN_EMAILS",
  "ADMIN_REQUIRE_AUTH",
  "FLOOR_PLAN_REVIEWER_EMAILS",
  "FLOOR_PLAN_PUBLISHER_EMAILS",
] as const;

type ControlledEnvironment = Record<string, string | undefined>;

function withEnvironment(overrides: ControlledEnvironment, run: () => void): void {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const deploymentCases: Array<{
  name: string;
  environment: ControlledEnvironment;
  expected: "development" | "staging" | "production" | null;
}> = [
  { name: "explicit development", environment: { APP_ENV: "development" }, expected: "development" },
  { name: "explicit staging", environment: { APP_ENV: "staging" }, expected: "staging" },
  { name: "explicit production", environment: { APP_ENV: "production" }, expected: "production" },
  { name: "trimmed case", environment: { APP_ENV: " Production " }, expected: "production" },
  { name: "Vercel development", environment: { VERCEL_ENV: "development" }, expected: "development" },
  { name: "Vercel preview", environment: { VERCEL_ENV: "preview" }, expected: "staging" },
  { name: "Vercel production", environment: { VERCEL_ENV: "production" }, expected: "production" },
  { name: "missing", environment: {}, expected: null },
  { name: "unknown APP_ENV", environment: { APP_ENV: "prod-ish" }, expected: null },
  { name: "blank APP_ENV does not fall back", environment: { APP_ENV: " ", VERCEL_ENV: "production" }, expected: null },
  { name: "APP_ENV preview is invalid", environment: { APP_ENV: "preview" }, expected: null },
  { name: "unknown Vercel environment", environment: { VERCEL_ENV: "staging" }, expected: null },
  { name: "public variable has no authority", environment: { NEXT_PUBLIC_APP_ENV: "development" }, expected: null },
];

for (const testCase of deploymentCases) {
  assert.equal(
    getApplicationEnvironment(testCase.environment),
    testCase.expected,
    testCase.name
  );
  if (testCase.expected === null) {
    assert.throws(
      () => validateDeploymentEnvironmentOrThrow(testCase.environment),
      /must explicitly identify a recognized deployment environment/,
      testCase.name
    );
  }
}

const allowedEnvironmentCases: ControlledEnvironment[] = [
  { APP_ENV: "development" },
  { APP_ENV: "staging" },
  { APP_ENV: "production" },
  { VERCEL_ENV: "development" },
  { VERCEL_ENV: "preview" },
  { VERCEL_ENV: "production" },
];

for (const environment of allowedEnvironmentCases) {
  withEnvironment({ ...environment, ADMIN_EMAILS: "admin@example.com" }, () => {
    assert.equal(isAdminEmail("admin@example.com"), true);
    assert.equal(isAdminEmail("ADMIN@EXAMPLE.COM"), true);
    assert.equal(isAdminEmail("ordinary@example.com"), false);
    assert.equal(canAccessAdmin("pro@example.com"), false);
  });
}

const deniedAuthorizationCases: Array<{ name: string; environment: ControlledEnvironment }> = [
  { name: "missing deployment", environment: { ADMIN_EMAILS: "admin@example.com" } },
  { name: "unknown deployment", environment: { APP_ENV: "unknown", ADMIN_EMAILS: "admin@example.com" } },
  { name: "missing allowlist", environment: { APP_ENV: "development" } },
  { name: "empty allowlist", environment: { APP_ENV: "development", ADMIN_EMAILS: " " } },
  { name: "blank allowlist entry", environment: { APP_ENV: "development", ADMIN_EMAILS: "admin@example.com," } },
  { name: "malformed allowlist email", environment: { APP_ENV: "development", ADMIN_EMAILS: "not-an-email" } },
  { name: "public environment forgery", environment: { NEXT_PUBLIC_APP_ENV: "development", ADMIN_EMAILS: "admin@example.com" } },
  {
    name: "legacy local bypass",
    environment: { APP_ENV: "development", ADMIN_REQUIRE_AUTH: "false" },
  },
  {
    name: "production test bypass",
    environment: { APP_ENV: "production", ADMIN_REQUIRE_AUTH: "false" },
  },
];

for (const testCase of deniedAuthorizationCases) {
  withEnvironment(testCase.environment, () => {
    assert.equal(canAccessAdmin("admin@example.com"), false, testCase.name);
  });
}

withEnvironment(
  {
    APP_ENV: "production",
    ADMIN_EMAILS: "admin@example.com",
    FLOOR_PLAN_REVIEWER_EMAILS: "reviewer@example.com",
    FLOOR_PLAN_PUBLISHER_EMAILS: "publisher@example.com",
  },
  () => {
    assert.equal(canReviewPublicFloorPlans("REVIEWER@example.com"), true);
    assert.equal(canPublishPublicFloorPlans("publisher@example.com"), true);
    assert.equal(canReviewPublicFloorPlans("ordinary@example.com"), false);
    assert.equal(canPublishPublicFloorPlans("pro@example.com"), false);
  }
);

withEnvironment(
  {
    APP_ENV: "production",
    ADMIN_EMAILS: "admin@example.com",
    FLOOR_PLAN_REVIEWER_EMAILS: "reviewer@example.com,not-an-email",
    FLOOR_PLAN_PUBLISHER_EMAILS: "publisher@example.com,",
  },
  () => {
    assert.equal(canReviewPublicFloorPlans("reviewer@example.com"), false);
    assert.equal(canPublishPublicFloorPlans("publisher@example.com"), false);
  }
);

withEnvironment({ APP_ENV: "development", ADMIN_EMAILS: "admin@example.com" }, () => {
  assert.equal(canAccessAdmin(null), false, "signed-out and malformed sessions must be denied");
  assert.equal(
    canAccessAdmin(({ email: "ordinary@example.com", role: "admin" }).email),
    false,
    "a forged client role must not grant authority"
  );

  let privilegedSideEffects = 0;
  const executePrivilegedOperation = (resolveEmail: () => string | null): boolean => {
    const email = resolveEmail();
    if (!canAccessAdmin(email)) return false;
    privilegedSideEffects += 1;
    return true;
  };

  assert.equal(executePrivilegedOperation(() => null), false);
  assert.equal(executePrivilegedOperation(() => "ordinary@example.com"), false);
  assert.throws(() => executePrivilegedOperation(() => { throw new Error("session lookup failed"); }));
  assert.equal(privilegedSideEffects, 0, "denied or failed authentication must have no side effects");
  assert.equal(executePrivilegedOperation(() => "admin@example.com"), true);
  assert.equal(privilegedSideEffects, 1, "an allowlisted administrator should preserve the intended path");
});

function discoverFiles(root: string, fileName: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...discoverFiles(entryPath, fileName));
    else if (entry.name === fileName) results.push(entryPath);
  }
  return results.sort();
}

function discoverTypeScriptFiles(root: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...discoverTypeScriptFiles(entryPath));
    else if (/\.tsx?$/.test(entry.name)) results.push(entryPath);
  }
  return results.sort();
}

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function adminCheckIndex(handlerSource: string): number {
  const indexes = [handlerSource.indexOf("canAccessAdmin("), handlerSource.indexOf("isAdminEmail(")]
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function assertProtectedHandlers(relativePath: string): void {
  const routeSource = source(relativePath);
  const matches = [...routeSource.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/g)];
  assert.ok(matches.length > 0, `${relativePath} must expose at least one route handler`);

  for (const [index, match] of matches.entries()) {
    const start = match.index ?? -1;
    assert.ok(start >= 0);
    const end = matches[index + 1]?.index ?? routeSource.length;
    const handlerSource = routeSource.slice(start, end);
    const authIndex = handlerSource.indexOf("await auth(");
    const checkIndex = adminCheckIndex(handlerSource);
    assert.ok(authIndex >= 0, `${relativePath} ${match[1]} must authenticate directly`);
    assert.ok(checkIndex > authIndex, `${relativePath} ${match[1]} must authorize after authentication`);
    assert.match(
      handlerSource,
      /(?:status:|error\(|errorResponse\(|rejectBeforeBodyRead\(|ApiBoundaryError\()[^\n]*(?:401|403|404)/,
      `${relativePath} ${match[1]} must deny direct calls`
    );

    const privilegedMarkers = [
      "prisma.",
      "request.json(",
      "request.formData(",
      "readJsonRequest(",
      "readBoundedRequestBody(",
      "runCatalog",
      "runVariantResolutionAudit(",
      "createImportJob(",
      "updateImportJobStatus(",
    ];
    const firstPrivilegedWork = privilegedMarkers
      .map((marker) => handlerSource.indexOf(marker))
      .filter((markerIndex) => markerIndex >= 0)
      .sort((left, right) => left - right)[0];
    if (firstPrivilegedWork !== undefined) {
      assert.ok(checkIndex < firstPrivilegedWork, `${relativePath} ${match[1]} must authorize before privileged work`);
    }
  }
}

const adminRoutePaths = discoverFiles(path.join(process.cwd(), "app/api/admin"), "route.ts")
  .map((filePath) => path.relative(process.cwd(), filePath));
for (const routePath of adminRoutePaths) assertProtectedHandlers(routePath);

for (const routePath of [
  "app/api/tools/glb-optimizer/route.ts",
  "app/api/track/event/route.ts",
]) {
  assertProtectedHandlers(routePath);
}

const adminPagePaths = discoverFiles(path.join(process.cwd(), "app/admin"), "page.tsx")
  .map((filePath) => path.relative(process.cwd(), filePath));
for (const pagePath of adminPagePaths) {
  const pageSource = source(pagePath);
  const isAdminRedirect = /redirect\((?:"|`)\/admin\//.test(pageSource);
  if (isAdminRedirect) continue;
  assert.match(pageSource, /await auth\(/, `${pagePath} must authenticate before rendering`);
  assert.ok(adminCheckIndex(pageSource) >= 0, `${pagePath} must use canonical admin authorization`);
}

const adminConsumers = discoverFiles(path.join(process.cwd(), "app"), "route.ts")
  .concat(discoverFiles(path.join(process.cwd(), "app"), "page.tsx"))
  .filter((filePath) => fs.readFileSync(filePath, "utf8").includes("@/lib/admin"));
const inventoriedConsumers = new Set([
  ...adminRoutePaths,
  ...adminPagePaths,
  "app/api/me/route.ts",
  "app/api/tools/glb-optimizer/route.ts",
  "app/api/track/event/route.ts",
]);
for (const filePath of adminConsumers) {
  const relativePath = path.relative(process.cwd(), filePath);
  assert.ok(inventoriedConsumers.has(relativePath), `${relativePath} is missing from the admin surface inventory`);
}

const productionAdminConsumers = ["app", "components", "features", "hooks", "lib"]
  .flatMap((directory) => discoverTypeScriptFiles(path.join(process.cwd(), directory)))
  .filter((filePath) => /(?:@\/|\.\.\/)lib\/admin/.test(fs.readFileSync(filePath, "utf8")));
for (const filePath of productionAdminConsumers) {
  assert.doesNotMatch(
    fs.readFileSync(filePath, "utf8"),
    /^["']use client["'];/m,
    `${path.relative(process.cwd(), filePath)} must not import server-only admin authorization`
  );
}

const meRoute = source("app/api/me/route.ts");
assert.ok(meRoute.indexOf("await auth(") < meRoute.indexOf("isAdminEmail("));
assert.ok(meRoute.indexOf("isAdminEmail(") < meRoute.indexOf("prisma.user.findUnique("));

const applicationSource = discoverFiles(path.join(process.cwd(), "app"), "route.ts")
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n");
assert.doesNotMatch(applicationSource, /x-interior-admin-bypass|devBypass/);
assert.doesNotMatch(source("lib/admin.ts"), /ADMIN_REQUIRE_AUTH|NEXT_PUBLIC_/);
assert.match(source("instrumentation.ts"), /validateDeploymentEnvironmentOrThrow\(\)/);

const privilegedCliPaths = [
  "scripts/run-floor-plan-import-worker.ts",
  "scripts/run-floor-plan-deletion-worker.ts",
  "scripts/run-floor-plan-retention-cleanup.ts",
  "scripts/audit-floor-plan-serving-integrity.ts",
  "scripts/import-model.ts",
  "scripts/restore-model-assets.ts",
  "scripts/sync-catalog-model-assets.ts",
  "scripts/sync-orphan-model-assets.ts",
];
for (const cliPath of privilegedCliPaths) {
  assert.match(
    source(cliPath),
    /async function (?:main|run)\([^)]*\)(?::[^\{]+)?\s*\{\s*validateDeploymentEnvironmentOrThrow\(\);/,
    `${cliPath} must validate deployment state before privileged CLI work`
  );
}

const backupScript = source("scripts/backup-db.sh");
assert.ok(backupScript.indexOf('case "${APP_ENV:-}"') < backupScript.indexOf("pg_dump"));
const restoreScript = source("scripts/restore-db.sh");
assert.ok(restoreScript.indexOf('case "${APP_ENV:-}"') < restoreScript.indexOf("psql"));
assert.ok(restoreScript.indexOf("--confirm-environment=") < restoreScript.indexOf('psql "${DATABASE_URL}"'));

for (const fixturePath of ["scripts/seed-test-data.ts", "scripts/seed-test-data.js"]) {
  const fixtureSource = source(fixturePath);
  assert.match(fixtureSource, /APP_ENV[\s\S]*development/);
  assert.match(fixtureSource, /localhost[\s\S]*127\.0\.0\.1[\s\S]*\[::1\]/);
}
assert.match(source("scripts/test-pro-billing-local.mjs"), /APP_ENV[\s\S]*development/);

const sentinelDatabaseSecret = "ch0001-database-secret-must-not-leak";
const tsNodeArguments = [
  path.join(process.cwd(), "node_modules/ts-node/dist/bin.js"),
  "--transpile-only",
  "--compiler-options",
  '{"module":"CommonJS","moduleResolution":"node"}',
  "-r",
  "tsconfig-paths/register",
  path.join(process.cwd(), "scripts/seed-test-data.ts"),
];

function expectCliDenial(input: {
  label: string;
  arguments: string[];
  environment: Record<string, string>;
  message: RegExp;
  excluded?: RegExp;
}): void {
  const result = spawnSync(process.execPath, input.arguments, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...input.environment },
  });
  assert.notEqual(result.status, 0, `${input.label} must fail closed`);
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, input.message, `${input.label} must explain the sanitized denial`);
  if (input.excluded) assert.doesNotMatch(output, input.excluded, `${input.label} leaked a secret`);
}

for (const [label, arguments_] of [
  ["TypeScript seed", tsNodeArguments],
  ["JavaScript seed", [path.join(process.cwd(), "scripts/seed-test-data.js")]],
] as const) {
  expectCliDenial({
    label: `${label} production target`,
    arguments: [...arguments_],
    environment: { APP_ENV: "production", DATABASE_URL: "postgresql://localhost/interior_ai_test" },
    message: /allowed only with APP_ENV=development/,
  });
  expectCliDenial({
    label: `${label} malformed database URL`,
    arguments: [...arguments_],
    environment: {
      APP_ENV: "development",
      DATABASE_URL: `postgresql://seed:${sentinelDatabaseSecret}@[invalid`,
    },
    message: /DATABASE_URL must be a valid URL/,
    excluded: new RegExp(sentinelDatabaseSecret),
  });
}

expectCliDenial({
  label: "Local billing production target",
  arguments: [path.join(process.cwd(), "scripts/test-pro-billing-local.mjs")],
  environment: { APP_ENV: "production" },
  message: /require APP_ENV=development/,
});
expectCliDenial({
  label: "Local billing malformed database URL",
  arguments: [path.join(process.cwd(), "scripts/test-pro-billing-local.mjs")],
  environment: {
    APP_ENV: "development",
    DATABASE_URL: `postgresql://billing:${sentinelDatabaseSecret}@[invalid`,
    STRIPE_SECRET_KEY: "sk_test_ch0001",
    STRIPE_WEBHOOK_SECRET: "whsec_ch0001",
    STRIPE_PRICE_PRO_MONTHLY: "price_ch0001_monthly",
    STRIPE_PRICE_PRO_YEARLY: "price_ch0001_yearly",
  },
  message: /DATABASE_URL must be a valid local database URL/,
  excluded: new RegExp(sentinelDatabaseSecret),
});

console.log(
  `Admin authorization tests passed (${adminRoutePaths.length} admin routes, ${adminPagePaths.length} admin pages, ${privilegedCliPaths.length + 5} privileged CLIs)`
);
