import assert from "node:assert/strict";
import { spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import AUTH_RESULT_CONTRACT_OWNER from "./ci-auth-fixture-result-contract.cjs";

import { SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER } from "../lib/auth-fixture-network";

type StreamDescriptor = Readonly<{ bytes: number; sha256: string }>;

type AuthResultContract = Readonly<{
  AUTH_RESULT_ROOT_ENV: string;
  AUTH_RESULT_PATH_ENV: string;
  AUTH_RESULT_NONCE_ENV: string;
  validateAuthCommandResult(options: {
    repositoryRoot: string;
    externalRoot: string;
    resultPath: string;
    expectedNonce: string;
    expectedCommandId: string;
    expectedMode: string;
    expectedCandidateCommitSha?: string;
    expectedCandidateTreeSha?: string;
    sensitiveValues?: string[];
    expectedStreamDescriptors?: Readonly<{
      stdout: StreamDescriptor;
      stderr: StreamDescriptor;
    }>;
  }): Readonly<{ result: Record<string, unknown> }>;
}>;

type SafeFailure = Readonly<{ code: string; category: string; message: string }>;
type PreflightOutcome = Readonly<{
  result: "success" | "failure";
  evidence: Readonly<Record<string, unknown>>;
  failure: SafeFailure | null;
}>;
type PreflightCleanupEvidence = {
  sigtermAttempted: boolean;
  sigkillFallbackAttempted: boolean;
  finalServerTermination: string;
  portReleased: boolean;
  taskOwnedCleanup: string;
  completed: boolean;
};
type ProductionChildOutcome = Readonly<{
  status: number | null;
  signal: NodeJS.Signals | null;
  spawnError: string | null;
  stdout: Buffer;
  stderr: Buffer;
  message: Record<string, unknown> | null;
}>;
type AuthFixtureModule = Readonly<{
  persistPreflightOutcome(
    command: "preflight" | "preflight-local",
    environment: NodeJS.ProcessEnv,
    outcome: PreflightOutcome,
  ): Record<string, unknown>;
  preflightAuthSession(
    environment: NodeJS.ProcessEnv,
    dependencies?: Readonly<{
      fetchImpl?: typeof fetch;
      spawnServer?: (executable: string, args: string[], options: object) => ChildProcess;
      now?: () => number;
      sleep?: (milliseconds: number) => Promise<void>;
      stopServer?: (server: ChildProcess) => Promise<PreflightCleanupEvidence>;
      portAvailable?: (host: string, port: number) => Promise<boolean>;
      portReleased?: (host: string, port: number) => Promise<boolean>;
    }>,
  ): Promise<PreflightOutcome>;
  productionMisuseEvidence(
    child: ProductionChildOutcome,
    sensitiveValues: string[],
  ): Readonly<{
    result: "expected-negative-pass" | "failure";
    evidence: Readonly<Record<string, unknown>>;
    failure: SafeFailure | null;
  }>;
}>;

const contract = AUTH_RESULT_CONTRACT_OWNER as AuthResultContract;
let authFixtureModule: AuthFixtureModule | null = null;

function authFixture(): AuthFixtureModule {
  if (!authFixtureModule) throw new Error("Auth fixture test module is not loaded");
  return authFixtureModule;
}
const repositoryRoot = process.cwd();
const fixtureNonce = "a".repeat(32);
const googleClientId =
  `123456789012345-gate-a3-ci-${fixtureNonce}.apps.googleusercontent.com`;
const googleClientSecret = `GOCSPX-gate-a3-ci-${fixtureNonce}`;
const authSecret = "ci-auth-result-test-secret-at-least-32-characters";
const roots: string[] = [];
let invocationSequence = 0;
const fakeServerOutput = new WeakMap<
  ChildProcess,
  Readonly<{ stdout: string; stderr: string }>
>();

function destination(prefix: string): Readonly<{
  root: string;
  resultPath: string;
  nonce: string;
}> {
  const root = realpathSync(
    mkdtempSync(path.join(tmpdir(), `ci-auth-result-${prefix}-`)),
  );
  roots.push(root);
  const parent = path.join(root, "results");
  mkdirSync(parent, { mode: 0o700 });
  invocationSequence += 1;
  return {
    root,
    resultPath: path.join(parent, "result.json"),
    nonce: `auth-result-test-${prefix}-${String(invocationSequence).padStart(3, "0")}`,
  };
}

function resultEnvironment(
  target: ReturnType<typeof destination>,
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    APP_ENV: "development",
    CI: "true",
    GITHUB_ACTIONS: "true",
    CI_AUTH_FIXTURE_MODE: "1",
    CI_AUTH_FIXTURE_ACTIVE: "1",
    AUTH_SECRET: authSecret,
    NEXTAUTH_SECRET: authSecret,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    [contract.AUTH_RESULT_ROOT_ENV]: target.root,
    [contract.AUTH_RESULT_PATH_ENV]: target.resultPath,
    [contract.AUTH_RESULT_NONCE_ENV]: target.nonce,
    ...overrides,
  };
}

function runPackage(packageScript: string, environment: NodeJS.ProcessEnv) {
  return spawnSync("npm", ["run", packageScript], {
    cwd: repositoryRoot,
    env: environment,
    encoding: "utf8",
  });
}

function validateResult(
  target: ReturnType<typeof destination>,
  commandId: string,
  mode: string,
  options: Readonly<{
    nonce?: string;
    sensitiveValues?: string[];
    expectedStreamDescriptors?: Readonly<{
      stdout: StreamDescriptor;
      stderr: StreamDescriptor;
    }>;
  }> = {},
) {
  return contract.validateAuthCommandResult({
    repositoryRoot,
    externalRoot: target.root,
    resultPath: target.resultPath,
    expectedNonce: options.nonce ?? target.nonce,
    expectedCommandId: commandId,
    expectedMode: mode,
    sensitiveValues: options.sensitiveValues,
    expectedStreamDescriptors: options.expectedStreamDescriptors,
  }).result;
}

function expectRejected(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
}

function runValidationCase(
  prefix: string,
  overrides: Partial<NodeJS.ProcessEnv>,
  expectedCode: string,
): Record<string, unknown> {
  const target = destination(prefix);
  const environment = resultEnvironment(target, overrides);
  const child = runPackage("ci:auth-fixture:validate", environment);
  assert.notEqual(child.status, 0, `${prefix} must fail`);
  const result = validateResult(
    target,
    "ci:auth-fixture:validate",
    "auth-environment-validation",
    { sensitiveValues: [googleClientId, googleClientSecret, authSecret] },
  );
  assert.equal(result.result, "failure");
  assert.equal((result.failure as Record<string, unknown>).code, expectedCode);
  const retained = readFileSync(target.resultPath, "utf8");
  assert.ok(!retained.includes(googleClientId));
  assert.ok(!retained.includes(googleClientSecret));
  assert.ok(!retained.includes(authSecret));
  return result;
}

function fakeServer({
  exitCode = null,
  signalCode = null,
  stdout = "",
  stderr = "",
}: Readonly<{
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
}> = {}): ChildProcess {
  const server = new EventEmitter() as ChildProcess;
  const state = server as unknown as {
    pid: number;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: (signal?: NodeJS.Signals | number) => boolean;
  };
  state.pid = 43117;
  state.exitCode = exitCode;
  state.signalCode = signalCode;
  state.stdout = new PassThrough();
  state.stderr = new PassThrough();
  state.kill = (signal = "SIGTERM") => {
    state.signalCode = typeof signal === "string" ? signal : "SIGTERM";
    queueMicrotask(() => {
      server.emit("exit", state.exitCode, state.signalCode);
      server.emit("close", state.exitCode, state.signalCode);
    });
    return true;
  };
  fakeServerOutput.set(server, { stdout, stderr });
  return server;
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function successfulFetchQueue(): typeof fetch {
  const origin = "http://127.0.0.1:3317";
  const responses = [
    jsonResponse(null),
    jsonResponse({
      google: {
        id: "google",
        signinUrl: `${origin}/api/auth/signin/google`,
        callbackUrl: `${origin}/api/auth/callback/google`,
      },
    }),
    jsonResponse(
      { csrfToken: "c".repeat(40) },
      { headers: { "set-cookie": "authjs.csrf-token=safe-fixture; Path=/" } },
    ),
    jsonResponse({ url: `${origin}/` }),
    jsonResponse({
      url:
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: googleClientId,
          redirect_uri: `${origin}/api/auth/callback/google`,
          response_type: "code",
          code_challenge: "safe-challenge",
        }),
    }),
  ];
  return (async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected preflight request");
    return response;
  }) as typeof fetch;
}

async function persistPreflightCase({
  prefix,
  fetchImpl,
  server = fakeServer(),
  now,
  sleep,
  stopServer,
  expectedCode,
  expectValidatorRejection = false,
}: Readonly<{
  prefix: string;
  fetchImpl: typeof fetch;
  server?: ChildProcess;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  stopServer?: (server: ChildProcess) => Promise<PreflightCleanupEvidence>;
  expectedCode?: string;
  expectValidatorRejection?: boolean;
}>): Promise<Readonly<{ outcome: PreflightOutcome; resultPath: string }>> {
  const target = destination(prefix);
  const environment = resultEnvironment(target);
  const outcome = await authFixture().preflightAuthSession(environment, {
    fetchImpl,
    spawnServer: () => {
      const output = fakeServerOutput.get(server);
      queueMicrotask(() => {
        if (output?.stdout) server.stdout?.emit("data", Buffer.from(output.stdout));
        if (output?.stderr) server.stderr?.emit("data", Buffer.from(output.stderr));
      });
      return server;
    },
    now,
    sleep,
    stopServer,
    portAvailable: async () => true,
    portReleased: async () => !expectValidatorRejection,
  });
  if (expectedCode) {
    assert.equal(outcome.result, "failure");
    assert.equal(outcome.failure?.code, expectedCode);
  }
  if (expectValidatorRejection) {
    expectRejected(
      () => authFixture().persistPreflightOutcome("preflight", environment, outcome),
      /failed server cleanup/,
    );
    const raw = JSON.parse(readFileSync(target.resultPath, "utf8")) as Record<string, unknown>;
    assert.equal(raw.result, "failure");
    assert.equal(
      ((raw.evidence as Record<string, unknown>).cleanup as Record<string, unknown>)
        .taskOwnedCleanup,
      "failed",
    );
  } else {
    authFixture().persistPreflightOutcome("preflight", environment, outcome);
    const result = validateResult(
      target,
      "ci:auth-fixture:preflight",
      "auth-session-preflight",
      { sensitiveValues: [googleClientId, googleClientSecret, authSecret] },
    );
    assert.equal(result.result, outcome.result);
  }
  return { outcome, resultPath: target.resultPath };
}

async function run(): Promise<void> {
  authFixtureModule = (await import(
    "./ci-auth-fixture" + ".ts"
  )) as AuthFixtureModule;
  const exportTarget = destination("export-success");
  const exportTransportRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), "ci-auth-export-transport-")),
  );
  roots.push(exportTransportRoot);
  const githubWorkspace = path.join(exportTransportRoot, "workspace");
  const githubEnvironment = path.join(exportTransportRoot, "github-environment");
  mkdirSync(githubWorkspace);
  writeFileSync(githubEnvironment, "");
  const exportChild = runPackage("ci:auth-fixture:export", {
    ...resultEnvironment(exportTarget),
    GITHUB_ENV: githubEnvironment,
    GITHUB_WORKSPACE: githubWorkspace,
  });
  assert.equal(
    exportChild.status,
    0,
    `fixture export failed: ${exportChild.stderr || exportChild.stdout}`,
  );
  const exportResult = validateResult(
    exportTarget,
    "ci:auth-fixture:export",
    "provider-fixture-export",
  );
  assert.equal(exportResult.result, "success");
  const exportedValues = readFileSync(githubEnvironment, "utf8")
    .trim()
    .split("\n")
    .map((line) => line.slice(line.indexOf("=") + 1));
  const exportResultBytes = readFileSync(exportTarget.resultPath, "utf8");
  for (const value of exportedValues) {
    if (value !== "1") assert.ok(!exportResultBytes.includes(value));
  }

  const validationSuccess = destination("validation-success");
  const validationEnvironment = resultEnvironment(validationSuccess);
  const validationChild = runPackage(
    "ci:auth-fixture:validate",
    validationEnvironment,
  );
  assert.equal(
    validationChild.status,
    0,
    `validation success failed: ${validationChild.stderr || validationChild.stdout}`,
  );
  const validationResult = validateResult(
    validationSuccess,
    "ci:auth-fixture:validate",
    "auth-environment-validation",
    { sensitiveValues: [googleClientId, googleClientSecret, authSecret] },
  );
  assert.equal(validationResult.result, "success");
  assert.equal(
    (validationResult.evidence as Record<string, unknown>).applicationValidator,
    "passed",
  );

  runValidationCase(
    "missing-provider",
    { GOOGLE_CLIENT_ID: undefined },
    "AUTH_PROVIDER_VARIABLE_MISSING",
  );
  runValidationCase(
    "missing-auth-secret",
    { AUTH_SECRET: undefined, NEXTAUTH_SECRET: undefined },
    "AUTH_SECRET_MISSING",
  );
  runValidationCase(
    "alias-mismatch",
    { NEXTAUTH_SECRET: `${authSecret}-different` },
    "AUTH_SECRET_ALIAS_MISMATCH",
  );
  runValidationCase(
    "production-contradiction",
    { APP_ENV: "production" },
    "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED",
  );

  const missingDestination = runPackage("ci:auth-fixture:validate", {
    ...validationEnvironment,
    [contract.AUTH_RESULT_ROOT_ENV]: undefined,
    [contract.AUTH_RESULT_PATH_ENV]: undefined,
  });
  assert.notEqual(missingDestination.status, 0);
  assert.match(missingDestination.stderr, /explicit absolute paths/);

  const symlinkTarget = destination("symlink-root-target");
  const symlinkParent = mkdtempSync(path.join(tmpdir(), "ci-auth-result-symlink-parent-"));
  roots.push(symlinkParent);
  const symlinkRoot = path.join(symlinkParent, "root-link");
  symlinkSync(symlinkTarget.root, symlinkRoot);
  const symlinkResult = runPackage("ci:auth-fixture:validate", {
    ...validationEnvironment,
    [contract.AUTH_RESULT_ROOT_ENV]: symlinkRoot,
    [contract.AUTH_RESULT_PATH_ENV]: path.join(symlinkRoot, "result.json"),
    [contract.AUTH_RESULT_NONCE_ENV]: "auth-result-symlink-root-001",
  });
  assert.notEqual(symlinkResult.status, 0);
  assert.match(symlinkResult.stderr, /physical directory/);

  const productionTarget = destination("production-misuse");
  const productionChild = runPackage(
    "ci:auth-fixture:production-misuse",
    resultEnvironment(productionTarget),
  );
  assert.equal(
    productionChild.status,
    0,
    `production misuse proof failed: ${productionChild.stderr || productionChild.stdout}`,
  );
  const productionResult = validateResult(
    productionTarget,
    "ci:auth-fixture:production-misuse",
    "production-misuse-validation",
  );
  assert.equal(productionResult.result, "expected-negative-pass");
  const productionEvidence = productionResult.evidence as Record<string, unknown>;
  assert.equal(
    productionEvidence.safeFailureCode,
    "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED",
  );
  assert.equal(productionEvidence.intendedRejectionProved, true);

  const intendedMessage = {
    schema: "interior-ai.ci-auth-fixture-production-misuse-child.v1",
    safeFailureCode: "SYNTHETIC_AUTH_FIXTURE_PRODUCTION_MISUSE_REJECTED",
    category: "production-activation-prohibited",
    syntheticFixtureUse: true,
    productionActivationProhibited: true,
  };
  const unrelatedChildren: Array<Readonly<{ name: string; child: ProductionChildOutcome }>> = [
    {
      name: "loader",
      child: {
        status: 1,
        signal: null,
        spawnError: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from("loader failure\n"),
        message: null,
      },
    },
    {
      name: "dependency",
      child: {
        status: 1,
        signal: null,
        spawnError: "ENOENT",
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        message: null,
      },
    },
    {
      name: "syntax",
      child: {
        status: 1,
        signal: null,
        spawnError: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from("syntax failure\n"),
        message: { ...intendedMessage, safeFailureCode: "SYNTAX_FAILURE" },
      },
    },
    {
      name: "missing-input",
      child: {
        status: 1,
        signal: null,
        spawnError: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from("missing input\n"),
        message: { ...intendedMessage, category: "missing-input" },
      },
    },
  ];
  for (const fixture of unrelatedChildren) {
    const outcome = authFixture().productionMisuseEvidence(fixture.child, []);
    assert.equal(outcome.result, "failure", `${fixture.name} must not pass`);
    assert.equal(outcome.evidence.intendedRejectionProved, false);
  }

  const noSidecar = destination("nonzero-no-sidecar");
  expectRejected(
    () =>
      validateResult(
        noSidecar,
        "ci:auth-fixture:production-misuse",
        "production-misuse-validation",
      ),
    /ENOENT/,
  );
  expectRejected(
    () =>
      validateResult(
        productionTarget,
        "ci:auth-fixture:production-misuse",
        "production-misuse-validation",
        {
          expectedStreamDescriptors: {
            stdout: { bytes: 999, sha256: "f".repeat(64) },
            stderr: { bytes: 999, sha256: "e".repeat(64) },
          },
        },
      ),
    /stream descriptor mismatch/,
  );
  expectRejected(
    () =>
      validateResult(
        validationSuccess,
        "ci:auth-fixture:validate",
        "auth-environment-validation",
        { nonce: "auth-result-test-stale-nonce-999" },
      ),
    /stale or belongs to another invocation/,
  );
  expectRejected(
    () =>
      contract.validateAuthCommandResult({
        repositoryRoot,
        externalRoot: validationSuccess.root,
        resultPath: validationSuccess.resultPath,
        expectedNonce: validationSuccess.nonce,
        expectedCommandId: "ci:auth-fixture:validate",
        expectedMode: "auth-environment-validation",
        expectedCandidateCommitSha: "a".repeat(40),
        expectedCandidateTreeSha: "b".repeat(40),
      }),
    /candidate commit or tree binding is mismatched/,
  );

  const foreignRootTarget = destination("foreign-root");
  cpSync(validationSuccess.resultPath, foreignRootTarget.resultPath);
  cpSync(
    `${validationSuccess.resultPath}.sha256`,
    `${foreignRootTarget.resultPath}.sha256`,
  );
  expectRejected(
    () =>
      validateResult(
        foreignRootTarget,
        "ci:auth-fixture:validate",
        "auth-environment-validation",
        { nonce: validationSuccess.nonce },
      ),
    /external destination binding is invalid/,
  );

  const aggregateTamperTarget = destination("aggregate-tamper");
  const aggregateTamperChild = runPackage(
    "ci:auth-fixture:validate",
    resultEnvironment(aggregateTamperTarget),
  );
  assert.equal(aggregateTamperChild.status, 0);
  const aggregateTamper = JSON.parse(
    readFileSync(aggregateTamperTarget.resultPath, "utf8"),
  ) as Record<string, unknown>;
  aggregateTamper.aggregateSha256 = "f".repeat(64);
  writeFileSync(
    aggregateTamperTarget.resultPath,
    `${JSON.stringify(aggregateTamper, null, 2)}\n`,
  );
  expectRejected(
    () =>
      validateResult(
        aggregateTamperTarget,
        "ci:auth-fixture:validate",
        "auth-environment-validation",
      ),
    /aggregate hash mismatch/,
  );

  const tamperTarget = destination("manual-tamper");
  const tamperChild = runPackage(
    "ci:auth-fixture:validate",
    resultEnvironment(tamperTarget),
  );
  assert.equal(tamperChild.status, 0);
  const tampered = JSON.parse(readFileSync(tamperTarget.resultPath, "utf8")) as Record<string, unknown>;
  (tampered.completion as Record<string, unknown>).marker = "MANUALLY_EDITED";
  writeFileSync(tamperTarget.resultPath, `${JSON.stringify(tampered, null, 2)}\n`);
  expectRejected(
    () =>
      validateResult(
        tamperTarget,
        "ci:auth-fixture:validate",
        "auth-environment-validation",
      ),
    /completion marker is missing/,
  );

  const successServer = fakeServer({ stdout: `${SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER}\n` });
  const preflightSuccess = await persistPreflightCase({
    prefix: "preflight-success",
    fetchImpl: successfulFetchQueue(),
    server: successServer,
  });
  assert.equal(
    preflightSuccess.outcome.result,
    "success",
    preflightSuccess.outcome.failure?.code,
  );
  const successEvidence = preflightSuccess.outcome.evidence;
  assert.equal(
    (successEvidence.sessionRequest as Record<string, unknown>).statusCode,
    200,
  );
  assert.equal(
    (successEvidence.cleanup as Record<string, unknown>).portReleased,
    true,
  );

  await persistPreflightCase({
    prefix: "server-before-listener",
    fetchImpl: (async () => {
      throw new Error("not reached");
    }) as typeof fetch,
    server: fakeServer({ exitCode: 1 }),
    expectedCode: "AUTH_PREFLIGHT_SERVER_EXITED_BEFORE_LISTENER",
  });

  let clock = 0;
  await persistPreflightCase({
    prefix: "readiness-failure",
    fetchImpl: (async () => {
      throw new Error("connection refused");
    }) as typeof fetch,
    now: () => clock,
    sleep: async () => {
      clock = 200_000;
    },
    expectedCode: "AUTH_PREFLIGHT_READINESS_FAILED",
  });

  const responseFailures: Array<Readonly<{
    prefix: string;
    response: Response;
    code: string;
  }>> = [
    {
      prefix: "session-404",
      response: jsonResponse({ error: "not-found" }, { status: 404 }),
      code: "AUTH_PREFLIGHT_SESSION_ENDPOINT_NOT_FOUND",
    },
    {
      prefix: "session-500",
      response: jsonResponse({ error: "failed" }, { status: 500 }),
      code: "AUTH_PREFLIGHT_SESSION_STATUS_INVALID",
    },
    {
      prefix: "session-html",
      response: new Response("<html>failure</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      code: "AUTH_PREFLIGHT_SESSION_CONTENT_TYPE_INVALID",
    },
    {
      prefix: "session-malformed",
      response: new Response("{broken", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      code: "AUTH_PREFLIGHT_SESSION_JSON_INVALID",
    },
    {
      prefix: "session-wrong-content-type",
      response: new Response("null", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
      code: "AUTH_PREFLIGHT_SESSION_CONTENT_TYPE_INVALID",
    },
    {
      prefix: "session-redirect-html",
      response: new Response("<html>redirect</html>", {
        status: 302,
        headers: { "content-type": "text/html", location: "/login" },
      }),
      code: "AUTH_PREFLIGHT_SESSION_REDIRECT_REJECTED",
    },
  ];
  for (const fixture of responseFailures) {
    await persistPreflightCase({
      prefix: fixture.prefix,
      fetchImpl: (async () => fixture.response) as typeof fetch,
      expectedCode: fixture.code,
    });
  }

  await persistPreflightCase({
    prefix: "server-signal",
    fetchImpl: (async () => {
      throw new Error("not reached");
    }) as typeof fetch,
    server: fakeServer({ signalCode: "SIGTERM" }),
    expectedCode: "AUTH_PREFLIGHT_SERVER_EXITED_BEFORE_LISTENER",
  });

  await persistPreflightCase({
    prefix: "cleanup-failure",
    fetchImpl: successfulFetchQueue(),
    server: fakeServer({ stdout: `${SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER}\n` }),
    stopServer: async () => ({
      sigtermAttempted: true,
      sigkillFallbackAttempted: true,
      finalServerTermination: "failed",
      portReleased: false,
      taskOwnedCleanup: "failed",
      completed: true,
    }),
    expectedCode: "AUTH_PREFLIGHT_CLEANUP_FAILED",
    expectValidatorRejection: true,
  });

  const occupiedTarget = destination("sidecar-write-failure");
  writeFileSync(occupiedTarget.resultPath, "occupied\n");
  const occupiedEnvironment = resultEnvironment(occupiedTarget);
  const occupiedOutcome = await authFixture().preflightAuthSession(occupiedEnvironment, {
    fetchImpl: successfulFetchQueue(),
    spawnServer: () =>
      fakeServer({ stdout: `${SYNTHETIC_CI_GOOGLE_DISCOVERY_MARKER}\n` }),
    portAvailable: async () => true,
    portReleased: async () => true,
  });
  expectRejected(
    () =>
      authFixture().persistPreflightOutcome(
        "preflight",
        occupiedEnvironment,
        occupiedOutcome,
      ),
    /must be absent before invocation/,
  );

  const unknownSchemaTarget = destination("unknown-schema");
  cpSync(validationSuccess.resultPath, unknownSchemaTarget.resultPath);
  cpSync(
    `${validationSuccess.resultPath}.sha256`,
    `${unknownSchemaTarget.resultPath}.sha256`,
  );
  const unknownSchema = JSON.parse(
    readFileSync(unknownSchemaTarget.resultPath, "utf8"),
  ) as Record<string, unknown>;
  unknownSchema.schema = "interior-ai.ci-auth-fixture-command-result.v99";
  writeFileSync(
    unknownSchemaTarget.resultPath,
    `${JSON.stringify(unknownSchema, null, 2)}\n`,
  );
  expectRejected(
    () =>
      validateResult(
        unknownSchemaTarget,
        "ci:auth-fixture:validate",
        "auth-environment-validation",
      ),
    /unknown or from the future/,
  );

  assert.ok(!existsSync(path.join(repositoryRoot, ".local", "ci-auth-fixture-results")));
  console.log("CI auth fixture structured-result tests passed");
}

run()
  .finally(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
