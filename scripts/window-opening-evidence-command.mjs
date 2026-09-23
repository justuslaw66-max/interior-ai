import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const OPTION_VALUE_NAMES = new Set(["--root", "--id", "--attempt-id", "--env-names"]);
const FLAG_NAMES = new Set(["--required", "--advisory"]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SENSITIVE_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|DATABASE_URL|API_KEY|PRIVATE_KEY|CLIENT_SECRET|AUTH/i;
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function requiredOption(options, name) {
  const value = options.get(name);
  if (typeof value !== "string" || !value) {
    throw new Error(`${name} requires a non-empty value.`);
  }
  return value;
}

export function parseEvidenceCommandArguments(args) {
  const separator = args.indexOf("--");
  if (separator < 0) throw new Error("Expected -- before the command argv.");
  const optionArgs = args.slice(0, separator);
  const argv = args.slice(separator + 1);
  if (!argv.length) throw new Error("Command argv is required after --.");
  const options = new Map();
  const flags = new Set();
  for (let index = 0; index < optionArgs.length; index += 1) {
    const token = optionArgs[index];
    if (FLAG_NAMES.has(token)) {
      if (flags.has(token)) throw new Error(`Duplicate option: ${token}.`);
      flags.add(token);
      continue;
    }
    if (!OPTION_VALUE_NAMES.has(token)) throw new Error(`Unknown option: ${token}.`);
    if (options.has(token)) throw new Error(`Duplicate option: ${token}.`);
    const value = optionArgs[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
    options.set(token, value);
    index += 1;
  }
  if (flags.has("--required") && flags.has("--advisory")) {
    throw new Error("Choose either --required or --advisory, not both.");
  }
  const logicalCommandId = requiredOption(options, "--id");
  const explicitAttemptId = options.get("--attempt-id");
  if (!ID_PATTERN.test(logicalCommandId)) throw new Error("Command id is malformed.");
  if (explicitAttemptId && !ID_PATTERN.test(explicitAttemptId)) {
    throw new Error("Attempt id is malformed.");
  }
  const environmentNames = options.has("--env-names")
    ? requiredOption(options, "--env-names").split(",")
    : [];
  if (environmentNames.some((name) => !ENV_NAME_PATTERN.test(name))) {
    throw new Error("Environment names must be comma-separated shell identifiers.");
  }
  if (new Set(environmentNames).size !== environmentNames.length) {
    throw new Error("Environment names must not be duplicated.");
  }
  return {
    evidenceRoot: path.resolve(requiredOption(options, "--root")),
    logicalCommandId,
    explicitAttemptId,
    environmentNames,
    classification: flags.has("--required") ? "required" : "advisory",
    argv,
  };
}

function spawnCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let spawnError = null;
    child.stdout?.on("data", (chunk) => stdout.push(chunk));
    child.stderr?.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { spawnError = error; });
    child.on("close", (code, signal) => resolve({
      code: code ?? (signal || spawnError ? 1 : 0),
      signal: signal ?? null,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat([
        ...stderr,
        ...(spawnError ? [Buffer.from(`${spawnError.message}\n`)] : []),
      ]),
    }));
  });
}

async function resolveExecutable(command, cwd, environment) {
  const candidate = command.includes("/") ? path.resolve(cwd, command) : null;
  if (candidate) {
    try { return await fs.realpath(candidate); } catch { return null; }
  }
  const found = await spawnCapture("which", [command], { cwd, env: environment });
  const resolved = found.stdout.toString("utf8").trim().split("\n")[0];
  if (found.code !== 0 || !resolved) return null;
  try { return await fs.realpath(resolved); } catch { return resolved; }
}

async function verifiedVersion(executable, args = ["--version"], cwd, environment) {
  if (!executable) return { value: "unavailable", verified: false };
  const result = await spawnCapture(executable, args, { cwd, env: environment });
  const output = `${result.stdout.toString("utf8")}\n${result.stderr.toString("utf8")}`.trim();
  return {
    value: result.code === 0 && output ? output.split("\n")[0].trim() : "unavailable",
    verified: result.code === 0 && Boolean(output),
  };
}

async function localToolMetadata(name, cwd, environment) {
  const binPath = path.join(cwd, "node_modules", ".bin", name);
  let resolvedPath;
  try { resolvedPath = await fs.realpath(binPath); } catch { resolvedPath = null; }
  const version = await verifiedVersion(resolvedPath, ["--version"], cwd, environment);
  return { name, resolvedExecutable: resolvedPath, version: version.value,
    versionVerified: version.verified, versionSource: resolvedPath ? "local-binary---version" : "unavailable" };
}

async function npmScriptMetadata(argv, cwd) {
  const scriptName = argv[2];
  if (!scriptName || argv[1] !== "run") {
    return { name: "npm", resolvedExecutable: null, version: "unavailable",
      versionVerified: false, versionSource: "unavailable" };
  }
  const packagePath = path.join(cwd, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
  const script = packageJson.scripts?.[scriptName];
  if (typeof script !== "string") throw new Error(`Unknown npm script: ${scriptName}.`);
  return {
    name: `npm-script:${scriptName}`,
    invokedScript: scriptName,
    scriptCommand: script,
    resolvedExecutable: packagePath,
    version: `${packageJson.name ?? "package"}@${packageJson.version ?? "unknown"}`,
    versionVerified: true,
    versionSource: "package-json",
  };
}

async function runnerMetadata(argv, cwd, launcher, environment) {
  if (argv[0] === "npx" && argv[1] && !argv[1].startsWith("-")) {
    return localToolMetadata(argv[1], cwd, environment);
  }
  if (argv[0] === "npm") return npmScriptMetadata(argv, cwd);
  if (argv[0] === "node") {
    const scriptPath = argv[1] && !argv[1].startsWith("-") ? path.resolve(cwd, argv[1]) : null;
    let scriptSha256 = null;
    if (scriptPath) {
      try { scriptSha256 = sha256(await fs.readFile(scriptPath)); } catch { scriptSha256 = null; }
    }
    return {
      name: scriptPath ? path.basename(scriptPath) : "node",
      resolvedExecutable: launcher.resolvedExecutable,
      version: launcher.version,
      versionVerified: launcher.versionVerified,
      versionSource: "node-launcher---version",
      scriptPath,
      scriptSha256,
    };
  }
  return { ...launcher, name: path.basename(argv[0]) };
}

function secretValues(environment) {
  return Object.entries(environment)
    .filter(([name, value]) => SENSITIVE_NAME.test(name) && typeof value === "string" && value.length >= 4)
    .map(([, value]) => value)
    .sort((left, right) => right.length - left.length);
}

function redactString(value, values) {
  return values.reduce((result, secret) => result.split(secret).join("<redacted>"), value);
}

export function redactCommandEvidence({ argv, stdout, stderr, environment }) {
  const values = secretValues(environment);
  return {
    argv: argv.map((value) => redactString(value, values)),
    stdout: Buffer.from(redactString(stdout.toString("utf8"), values)),
    stderr: Buffer.from(redactString(stderr.toString("utf8"), values)),
  };
}

export async function physicalFileRecord(filePath, evidenceRoot) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile()) throw new Error(`Evidence log is not a regular file: ${filePath}`);
  const content = await fs.readFile(filePath);
  return {
    path: path.relative(evidenceRoot, filePath),
    type: "file",
    mode: (stat.mode & 0o7777).toString(8).padStart(4, "0"),
    bytes: content.byteLength,
    sha256: sha256(content),
  };
}

export function createAttemptId(startedAt = new Date()) {
  return `${startedAt.toISOString().replace(/[-:.]/g, "")}-${randomUUID()}`;
}

export async function collectCommandMetadata(argv, cwd, environment) {
  const launcherPath = await resolveExecutable(argv[0], cwd, environment);
  const launcherVersion = await verifiedVersion(
    launcherPath, ["--version"], cwd, environment
  );
  const launcher = {
    name: path.basename(argv[0]),
    resolvedExecutable: launcherPath,
    version: launcherVersion.value,
    versionVerified: launcherVersion.verified,
    versionSource: "launcher---version",
  };
  const runner = await runnerMetadata(argv, cwd, launcher, environment);
  const npmPath = await resolveExecutable("npm", cwd, environment);
  const npmVersion = await verifiedVersion(npmPath, ["--version"], cwd, environment);
  return { launcher, runner, nodeVersion: process.version, npmVersion: npmVersion.value };
}

export { spawnCapture, SENSITIVE_NAME };
