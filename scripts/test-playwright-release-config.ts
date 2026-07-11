import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

type ConfigProbe = {
  baseURL?: string;
  metadata?: Record<string, unknown>;
  globalSetup?: string;
  hasExtraHTTPHeaders: boolean;
  hasWebServer: boolean;
  storageState?: string;
  webServerCommand?: string;
  reuseExistingServer?: boolean;
};

const RELEASE_VARIABLES = [
  "PLAYWRIGHT_BASE_URL",
  "PLAYWRIGHT_WEB_SERVER_PORT",
  "PLAYWRIGHT_RELEASE_BASE_URL",
  "PLAYWRIGHT_RELEASE_COMMIT",
  "PLAYWRIGHT_RELEASE_ENVIRONMENT",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
] as const;

function probeConfig(overrides: Record<string, string> = {}) {
  const env = { ...process.env };

  for (const name of RELEASE_VARIABLES) {
    delete env[name];
  }

  Object.assign(env, overrides, {
    PLAYWRIGHT_CONFIG_PROBE_CHILD: "1",
    TS_NODE_COMPILER_OPTIONS: JSON.stringify({
      module: "CommonJS",
      moduleResolution: "node",
    }),
  });

  return spawnSync(
    process.execPath,
    ["-r", require.resolve("ts-node/register/transpile-only"), __filename],
    { cwd: process.cwd(), encoding: "utf8", env }
  );
}

if (process.env.PLAYWRIGHT_CONFIG_PROBE_CHILD === "1") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require("../playwright.config").default;
  const probe: ConfigProbe = {
    baseURL: config.use?.baseURL,
    metadata: config.metadata,
    globalSetup: config.globalSetup,
    hasExtraHTTPHeaders: config.use?.extraHTTPHeaders !== undefined,
    hasWebServer: config.webServer !== undefined,
    storageState:
      typeof config.use?.storageState === "string"
        ? config.use.storageState
        : undefined,
    webServerCommand: Array.isArray(config.webServer)
      ? config.webServer[0]?.command
      : config.webServer?.command,
    reuseExistingServer: Array.isArray(config.webServer)
      ? config.webServer[0]?.reuseExistingServer
      : config.webServer?.reuseExistingServer,
  };

  process.stdout.write(JSON.stringify(probe));
} else {
  const releaseIdentity = {
    PLAYWRIGHT_RELEASE_COMMIT: "0123456789abcdef0123456789abcdef01234567",
    PLAYWRIGHT_RELEASE_ENVIRONMENT: "staging",
  };
  const localResult = probeConfig();
  assert.equal(localResult.status, 0, localResult.stderr);
  const local = JSON.parse(localResult.stdout) as ConfigProbe;
  assert.equal(local.baseURL, "http://127.0.0.1:3000");
  assert.equal(local.hasWebServer, true);
  assert.equal(local.reuseExistingServer, false);
  assert.match(local.webServerCommand ?? "", /next start -H 127\.0\.0\.1/);
  assert.doesNotMatch(
    local.webServerCommand ?? "",
    /APP_ENV|NEXT_PUBLIC_ENABLE_QA_HOOKS|NEXT_PUBLIC_ENABLE_TEST_FIXTURES/
  );
  assert.equal(local.globalSetup, undefined);
  assert.equal(local.storageState, undefined);

  const customLocalResult = probeConfig({
    PLAYWRIGHT_BASE_URL: "http://localhost:4555",
  });
  assert.equal(customLocalResult.status, 0, customLocalResult.stderr);
  const customLocal = JSON.parse(customLocalResult.stdout) as ConfigProbe;
  assert.equal(customLocal.baseURL, "http://localhost:4555");
  assert.match(customLocal.webServerCommand ?? "", /next start -H 127\.0\.0\.1 -p 4555/);

  const releaseResult = probeConfig({
    PLAYWRIGHT_RELEASE_BASE_URL: "https://cabinetry.example.com/",
    ...releaseIdentity,
  });
  assert.equal(releaseResult.status, 0, releaseResult.stderr);
  const release = JSON.parse(releaseResult.stdout) as ConfigProbe;
  assert.equal(release.baseURL, "https://cabinetry.example.com");
  assert.equal(release.hasWebServer, false);
  assert.equal(release.globalSetup, undefined);
  assert.equal(release.storageState, undefined);
  assert.deepEqual(release.metadata, {
    buildCommit: releaseIdentity.PLAYWRIGHT_RELEASE_COMMIT,
    releaseEnvironment: releaseIdentity.PLAYWRIGHT_RELEASE_ENVIRONMENT,
    releaseBaseURL: "https://cabinetry.example.com",
  });

  const protectedResult = probeConfig({
    PLAYWRIGHT_RELEASE_BASE_URL: "https://cabinetry.example.com",
    ...releaseIdentity,
    VERCEL_AUTOMATION_BYPASS_SECRET: "probe-secret-must-not-leak",
  });
  assert.equal(protectedResult.status, 0, protectedResult.stderr);
  assert.equal(protectedResult.stdout.includes("probe-secret-must-not-leak"), false);
  const protectedRelease = JSON.parse(protectedResult.stdout) as ConfigProbe;
  assert.equal(protectedRelease.globalSetup, undefined);
  assert.equal(protectedRelease.hasExtraHTTPHeaders, false);
  assert.equal(protectedRelease.storageState, undefined);

  const insecureRelease = probeConfig({
    PLAYWRIGHT_RELEASE_BASE_URL: "http://cabinetry.example.com",
    ...releaseIdentity,
  });
  assert.notEqual(insecureRelease.status, 0);
  assert.match(insecureRelease.stderr, /must use HTTPS/);

  const loopbackRelease = probeConfig({
    PLAYWRIGHT_RELEASE_BASE_URL: "https://localhost:3000",
    ...releaseIdentity,
  });
  assert.notEqual(loopbackRelease.status, 0);
  assert.match(loopbackRelease.stderr, /hosted release candidate/);

  for (const loopbackUrl of [
    "https://localhost.",
    "https://[::1]:4443",
    "https://[::ffff:7f00:1]",
  ]) {
    const loopbackVariant = probeConfig({
      PLAYWRIGHT_RELEASE_BASE_URL: loopbackUrl,
      ...releaseIdentity,
    });
    assert.notEqual(loopbackVariant.status, 0, loopbackUrl);
    assert.match(loopbackVariant.stderr, /hosted release candidate/);
  }

  const scopedPathRelease = probeConfig({
    PLAYWRIGHT_RELEASE_BASE_URL:
      "https://cabinetry.example.com/rc-4?deployment=frozen#candidate",
    ...releaseIdentity,
  });
  assert.notEqual(scopedPathRelease.status, 0);
  assert.match(scopedPathRelease.stderr, /hosted release candidate/);

  const missingCommit = probeConfig({
    PLAYWRIGHT_RELEASE_BASE_URL: "https://cabinetry.example.com",
    PLAYWRIGHT_RELEASE_ENVIRONMENT: releaseIdentity.PLAYWRIGHT_RELEASE_ENVIRONMENT,
  });
  assert.notEqual(missingCommit.status, 0);
  assert.match(missingCommit.stderr, /PLAYWRIGHT_RELEASE_COMMIT/);

  const missingEnvironment = probeConfig({
    PLAYWRIGHT_RELEASE_BASE_URL: "https://cabinetry.example.com",
    PLAYWRIGHT_RELEASE_COMMIT: releaseIdentity.PLAYWRIGHT_RELEASE_COMMIT,
  });
  assert.notEqual(missingEnvironment.status, 0);
  assert.match(missingEnvironment.stderr, /PLAYWRIGHT_RELEASE_ENVIRONMENT/);

  const remoteLegacyBase = probeConfig({
    PLAYWRIGHT_BASE_URL: "https://cabinetry.example.com",
  });
  assert.notEqual(remoteLegacyBase.status, 0);
  assert.match(remoteLegacyBase.stderr, /restricted to local testing/);

  const unscopedSecret = probeConfig({
    VERCEL_AUTOMATION_BYPASS_SECRET: "probe-secret-must-not-leak",
  });
  assert.notEqual(unscopedSecret.status, 0);
  assert.equal(unscopedSecret.stderr.includes("probe-secret-must-not-leak"), false);
  assert.match(unscopedSecret.stderr, /may only be used with/);

  console.log(
    "Playwright release config checks passed: HTTPS routing, production-matching local isolation, and request-scoped Vercel bypass."
  );
}
