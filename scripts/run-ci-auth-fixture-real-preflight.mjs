import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const authResultContract = require("./ci-auth-fixture-result-contract.cjs");
const { Client } = pg;

function git(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Real auth preflight could not establish exact source identity");
  }
  return result.stdout.trim();
}

function runChild(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("Real auth preflight child did not complete successfully");
  }
  return result;
}

function quotedIdentifier(value) {
  if (!/^[a-z][a-z0-9_]{10,62}$/.test(value)) {
    throw new Error("Disposable auth preflight database identity is malformed");
  }
  return `"${value}"`;
}

async function databaseExists(client, databaseName) {
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [databaseName],
  );
  return result.rowCount === 1;
}

async function run() {
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") {
    throw new Error("Real auth preflight requires an exact clean committed head");
  }
  const commitSha = git(["rev-parse", "HEAD"]);
  const treeSha = git(["rev-parse", "HEAD^{tree}"]);
  const databaseName =
    `interior_ai_auth_${process.pid}_${randomBytes(5).toString("hex")}`;
  const databaseIdentifier = quotedIdentifier(databaseName);
  const databaseRole = userInfo().username;
  const admin = new Client({
    host: "127.0.0.1",
    port: 5432,
    user: databaseRole,
    database: "postgres",
  });
  let databaseCreated = false;
  const resultRoot = realpathSync(
    mkdtempSync(path.join(tmpdir(), "ci-auth-real-preflight-result-")),
  );
  const resultPath = path.join(resultRoot, "preflight.json");
  const invocationNonce =
    `auth-real-preflight-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    await admin.connect();
    if (await databaseExists(admin, databaseName)) {
      throw new Error("Disposable auth preflight database unexpectedly pre-exists");
    }
    await admin.query(`CREATE DATABASE ${databaseIdentifier}`);
    databaseCreated = true;
    const databaseUrl = new URL("postgresql://127.0.0.1:5432/");
    databaseUrl.username = databaseRole;
    databaseUrl.pathname = `/${databaseName}`;
    const environment = {
      ...process.env,
      DATABASE_URL: databaseUrl.href,
      CI_AUTH_FIXTURE_RESULT_ROOT: resultRoot,
      CI_AUTH_FIXTURE_RESULT_PATH: resultPath,
      CI_AUTH_FIXTURE_RESULT_NONCE: invocationNonce,
      CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: commitSha,
      CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: treeSha,
    };
    runChild("npm", ["run", "test:advisory-auth-preflight"], environment);
    const validated = authResultContract.validateAuthCommandResult({
      repositoryRoot: process.cwd(),
      externalRoot: resultRoot,
      resultPath,
      expectedNonce: invocationNonce,
      expectedCommandId: "test:advisory-auth-preflight",
      expectedMode: "auth-session-preflight",
      expectedCandidateCommitSha: commitSha,
      expectedCandidateTreeSha: treeSha,
      sensitiveValues: authResultContract.privateValuesFromEnvironment(environment),
    });
    const evidence = validated.result.evidence;
    assert.equal(validated.result.result, "success");
    assert.equal(evidence.sessionRequest.statusCode, 200);
    assert.equal(evidence.sessionRequest.contentTypeClassification, "application-json");
    assert.equal(evidence.sessionRequest.redirectCount, 0);
    assert.ok(["null", "object"].includes(evidence.sessionRequest.safeBodyType));
    assert.equal(evidence.sessionRequest.signedOutValidation, "passed");
    assert.equal(evidence.cleanup.finalServerTermination, "passed");
    assert.equal(evidence.cleanup.portReleased, true);
    assert.equal(evidence.checks.nonLoopbackRequestCount, 0);
  } finally {
    try {
      if (databaseCreated) {
        await admin.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [databaseName],
        );
        await admin.query(`DROP DATABASE ${databaseIdentifier}`);
        if (await databaseExists(admin, databaseName)) {
          throw new Error("Disposable auth preflight database cleanup did not complete");
        }
      }
    } finally {
      await admin.end().catch(() => undefined);
      rmSync(resultRoot, { recursive: true, force: true });
    }
  }
  console.log("Real task-owned auth-session preflight fixture passed and cleaned up");
}

run().catch(() => {
  console.error("Real task-owned auth-session preflight fixture failed closed");
  process.exitCode = 1;
});
