import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

export const REQUIRED_TEST_MANIFEST_SCHEMA =
  "interior-ai.required-test-manifest.v1";
export const REQUIRED_TEST_EVIDENCE_SCHEMA =
  "interior-ai.required-test-evidence.v1";

const DEFAULT_MANIFEST_PATH = "scripts/required-test-manifest.json";
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SENSITIVE_KEY =
  /(secret|token|password|private.?key|cookie|database.?url|credential)/i;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function repositoryPath(repositoryRoot, relativePath, description) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${description} must be a non-empty repository-relative path`);
  }
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${description} must remain inside the repository`);
  }
  return resolved;
}

function readJson(absolutePath, description) {
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`${description} is missing`);
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    throw new Error(`${description} is malformed or truncated`);
  }
}

export function loadRequiredTestManifest(
  repositoryRoot,
  manifestPath = DEFAULT_MANIFEST_PATH,
) {
  const manifest = readJson(
    repositoryPath(repositoryRoot, manifestPath, "required-test manifest path"),
    "required-test manifest",
  );
  if (manifest.schema !== REQUIRED_TEST_MANIFEST_SCHEMA) {
    throw new Error("required-test manifest schema is unsupported");
  }
  if (!Array.isArray(manifest.gates) || !Array.isArray(manifest.sourceInventories)) {
    throw new Error("required-test manifest gate or source inventory is malformed");
  }
  return manifest;
}

function listFilesRecursively(root, relativeDirectory) {
  const absoluteDirectory = repositoryPath(root, relativeDirectory, "inventory root");
  if (!existsSync(absoluteDirectory) || !statSync(absoluteDirectory).isDirectory()) {
    throw new Error(`inventory root ${relativeDirectory} is missing`);
  }
  const files = [];
  const visit = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(normalizePath(path.relative(root, absolutePath)));
    }
  };
  visit(absoluteDirectory);
  return files;
}

export function inventoryFiles(repositoryRoot, inventory) {
  let pattern;
  try {
    pattern = new RegExp(inventory.filePattern);
  } catch {
    throw new Error(`source inventory ${inventory.id} has an invalid file pattern`);
  }
  return listFilesRecursively(repositoryRoot, inventory.root)
    .filter((file) => pattern.test(path.posix.basename(file)))
    .sort();
}

function inventoryPathSha256(files) {
  return sha256(`${files.join("\n")}\n`);
}

function packageScriptNames(gate) {
  if (typeof gate.packageScript === "string") return [gate.packageScript];
  return Array.isArray(gate.packageScripts) ? gate.packageScripts : [];
}

function scriptReferences(script) {
  return [...script.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]);
}

function scriptSources(script) {
  return [
    ...script.matchAll(
      /\b(?:scripts|tests)\/[A-Za-z0-9_./-]+\.(?:js|json|mjs|ts|tsx)\b/g,
    ),
  ].map((match) => match[0]);
}

function expandedPackageScriptEntries(packageScripts, rootScriptNames) {
  const entries = new Map();
  const visit = (scriptName, visiting = new Set()) => {
    if (visiting.has(scriptName)) {
      throw new Error(`package script cycle reaches ${scriptName}`);
    }
    if (entries.has(scriptName)) return;
    const script = packageScripts[scriptName];
    if (typeof script !== "string") throw new Error(`package script ${scriptName} is missing`);
    entries.set(scriptName, script);
    const nextVisiting = new Set(visiting).add(scriptName);
    for (const child of scriptReferences(script)) visit(child, nextVisiting);
  };
  for (const scriptName of rootScriptNames) visit(scriptName);
  return entries;
}

function packageClosureIdentity(entries) {
  const lines = [...entries.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, script]) => `${name}\u0000${script}`);
  return { expectedScriptCount: lines.length, expectedSha256: sha256(`${lines.join("\n")}\n`) };
}

function expandedPackageSources(entries) {
  const sources = new Set();
  for (const script of entries.values()) {
    for (const source of scriptSources(script)) sources.add(source);
  }
  return sources;
}

function extractWorkflowJob(workflow, jobName) {
  const jobPattern = /^  ([A-Za-z0-9_-]+):\s*$/gm;
  let match;
  while ((match = jobPattern.exec(workflow)) !== null) {
    if (match[1] !== jobName) continue;
    const start = match.index;
    const next = jobPattern.exec(workflow);
    return workflow.slice(start, next?.index ?? workflow.length);
  }
  return "";
}

function sourceContainsFocusedTest(source) {
  return /\b(?:describe|test)\.only\s*\(/.test(source);
}

function sourceContainsProhibitedSkip(source) {
  return /\b(?:describe|test)\.(?:fixme|skip)\s*\(/.test(source);
}

function validateGateShape(gate, issues) {
  if (!/^[a-z0-9][a-z0-9.-]+$/.test(gate.id ?? "")) {
    issues.push(`gate ${String(gate.id)} has an invalid stable requirement ID`);
  }
  if (typeof gate.invariant !== "string" || gate.invariant.trim().length === 0) {
    issues.push(`gate ${gate.id} is missing its protected invariant`);
  }
  if (!new Set(["merge-required", "release-blocking", "advisory"]).has(gate.cadence)) {
    issues.push(`gate ${gate.id} has an unknown cadence`);
  }
  if (gate.blocking !== (gate.cadence !== "advisory")) {
    issues.push(`gate ${gate.id} blocking status contradicts its cadence`);
  }
  if (typeof gate.command !== "string" || gate.command.trim().length === 0) {
    issues.push(`gate ${gate.id} is missing its canonical command`);
  }
  if (!Array.isArray(gate.requiredSources) || !Array.isArray(gate.requiredProjects)) {
    issues.push(`gate ${gate.id} has malformed required source or project coverage`);
  }
  const requirementIds = new Set();
  for (const requirement of gate.requiredTests ?? []) {
    if (!/^[a-z0-9][a-z0-9.-]+$/.test(requirement.id ?? "")) {
      issues.push(`gate ${gate.id} has an invalid test requirement ID`);
    } else if (requirementIds.has(requirement.id)) {
      issues.push(`gate ${gate.id} duplicates test requirement ${requirement.id}`);
    }
    requirementIds.add(requirement.id);
    if (!requirement.file || !requirement.title) {
      issues.push(`gate ${gate.id} has an incomplete required test identity`);
    }
  }
}

export function validateRequiredTestRepository({
  repositoryRoot,
  manifestPath = DEFAULT_MANIFEST_PATH,
}) {
  const root = path.resolve(repositoryRoot);
  const issues = [];
  let manifest;
  try {
    manifest = loadRequiredTestManifest(root, manifestPath);
  } catch (error) {
    return { valid: false, issues: [error instanceof Error ? error.message : String(error)] };
  }
  const inventories = new Map();
  const inventoryIds = new Set();
  for (const inventory of manifest.sourceInventories) {
    if (!/^[a-z0-9][a-z0-9.-]+$/.test(inventory.id ?? "")) {
      issues.push(`source inventory ${String(inventory.id)} has an invalid ID`);
      continue;
    }
    if (inventoryIds.has(inventory.id)) {
      issues.push(`source inventory ${inventory.id} is duplicated`);
      continue;
    }
    inventoryIds.add(inventory.id);
    try {
      const files = inventoryFiles(root, inventory);
      inventories.set(inventory.id, files);
      const digest = inventoryPathSha256(files);
      if (files.length !== inventory.expectedFileCount || digest !== inventory.expectedPathSha256) {
        issues.push(
          `source inventory ${inventory.id} changed: expected ${inventory.expectedFileCount}/${inventory.expectedPathSha256}, found ${files.length}/${digest}`,
        );
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  const packageJson = readJson(path.join(root, "package.json"), "package.json");
  const packageScripts = packageJson.scripts ?? {};
  const gateIds = new Set();
  for (const gate of manifest.gates) {
    validateGateShape(gate, issues);
    if (gateIds.has(gate.id)) issues.push(`gate ${gate.id} is duplicated`);
    gateIds.add(gate.id);
    if (gate.requiredInventory && !inventories.has(gate.requiredInventory)) {
      issues.push(`gate ${gate.id} references missing source inventory ${gate.requiredInventory}`);
    }
    for (const inventoryId of gate.supportingInventories ?? []) {
      if (!inventories.has(inventoryId)) {
        issues.push(`gate ${gate.id} references missing supporting inventory ${inventoryId}`);
      }
    }
    for (const source of gate.requiredSources ?? []) {
      let absolutePath;
      try {
        absolutePath = repositoryPath(root, source, `gate ${gate.id} source`);
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        issues.push(`gate ${gate.id} required source ${source} is missing`);
      }
    }
    const namedScripts = packageScriptNames(gate);
    for (const scriptName of namedScripts) {
      if (typeof packageScripts[scriptName] !== "string") {
        issues.push(`gate ${gate.id} package script ${scriptName} is missing`);
      }
    }
    if (namedScripts.length > 0) {
      for (const scriptName of namedScripts) {
        if (!gate.command.includes(`npm run ${scriptName}`)) {
          issues.push(`gate ${gate.id} canonical command omits package script ${scriptName}`);
        }
      }
      let expanded = new Set();
      try {
        const closure = expandedPackageScriptEntries(packageScripts, namedScripts);
        expanded = expandedPackageSources(closure);
        const identity = packageClosureIdentity(closure);
        if (
          gate.packageClosure?.expectedScriptCount !== identity.expectedScriptCount ||
          gate.packageClosure?.expectedSha256 !== identity.expectedSha256
        ) {
          issues.push(
            `gate ${gate.id} package-script closure changed: expected ${gate.packageClosure?.expectedScriptCount ?? "missing"}/${gate.packageClosure?.expectedSha256 ?? "missing"}, found ${identity.expectedScriptCount}/${identity.expectedSha256}`,
          );
        }
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
      if (gate.runner !== "playwright") {
        for (const source of gate.requiredSources ?? []) {
          if (/^scripts\/test-/.test(source) && !expanded.has(source)) {
            issues.push(
              `gate ${gate.id} does not execute required source ${source} through its package command`,
            );
          }
        }
      }
    }
    if (gate.runner === "playwright" && !gate.allowSkips && !gate.requiredInventory) {
      for (const source of gate.requiredSources ?? []) {
        if (!source.endsWith(".spec.ts")) continue;
        const absolutePath = path.join(root, source);
        if (existsSync(absolutePath) && sourceContainsProhibitedSkip(readFileSync(absolutePath, "utf8"))) {
          issues.push(`gate ${gate.id} required spec ${source} contains a prohibited skip or fixme`);
        }
      }
    }
  }

  const workflowPath = path.join(root, ".github/workflows/ci.yml");
  if (!existsSync(workflowPath)) {
    issues.push("required CI workflow .github/workflows/ci.yml is missing");
  } else {
    const workflow = readFileSync(workflowPath, "utf8");
    for (const gate of manifest.gates.filter((entry) => entry.ci)) {
      const job = extractWorkflowJob(workflow, gate.ci.job);
      if (!job) {
        issues.push(`CI job ${gate.ci.job} for gate ${gate.id} is missing`);
        continue;
      }
      if (gate.blocking && /continue-on-error:\s*true/.test(job)) {
        issues.push(`blocking CI job ${gate.ci.job} for gate ${gate.id} cannot continue on error`);
      }
      if (!gate.blocking && !/continue-on-error:\s*true/.test(job)) {
        issues.push(`advisory CI job ${gate.ci.job} must remain explicitly non-blocking`);
      }
      for (const scriptName of packageScriptNames(gate)) {
        if (!job.includes(`npm run ${scriptName}`)) {
          issues.push(`CI job ${gate.ci.job} does not invoke gate ${gate.id} (${scriptName})`);
        }
      }
      const requiredInvocations = Array.isArray(gate.ci.invocations)
        ? gate.ci.invocations
        : gate.ci.invocation
          ? [gate.ci.invocation]
          : [];
      for (const invocation of requiredInvocations) {
        if (!job.includes(invocation)) {
          issues.push(`CI job ${gate.ci.job} does not contain gate ${gate.id} invocation`);
        }
      }
    }
  }

  for (const directory of manifest.staticPolicies?.forbidFocusedTestsIn ?? []) {
    let files = [];
    try {
      files = listFilesRecursively(root, directory).filter((file) =>
        /\.(?:js|mjs|ts|tsx)$/.test(file),
      );
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
    for (const file of files) {
      if (sourceContainsFocusedTest(readFileSync(path.join(root, file), "utf8"))) {
        issues.push(`focused test execution is prohibited in ${file}`);
      }
    }
  }
  for (const file of manifest.staticPolicies?.failClosedPrerequisiteSources ?? []) {
    const absolutePath = path.join(root, file);
    if (!existsSync(absolutePath)) {
      issues.push(`fail-closed prerequisite source ${file} is missing`);
      continue;
    }
    const source = readFileSync(absolutePath, "utf8");
    if (/test\.info\(\)\.annotations\.push/.test(source)) {
      issues.push(`required prerequisite in ${file} can be annotated away`);
    }
    if (sourceContainsProhibitedSkip(source)) {
      issues.push(`required prerequisite in ${file} contains a prohibited skip or fixme`);
    }
  }
  for (const registrationGroup of manifest.requiredRegistrations ?? []) {
    let entrySource = "";
    try {
      const entryPath = repositoryPath(
        root,
        registrationGroup.entry,
        `required registration ${registrationGroup.id} entry`,
      );
      if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
        issues.push(`required registration entry ${registrationGroup.entry} is missing`);
        continue;
      }
      entrySource = readFileSync(entryPath, "utf8");
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    for (const registration of registrationGroup.registrations ?? []) {
      const importText = `import { ${registration.symbol} } from "${registration.module}";`;
      if (!entrySource.includes(importText)) {
        issues.push(
          `required registration ${registrationGroup.id} does not import ${registration.symbol} from ${registration.module}`,
        );
      }
      const escapedSymbol = registration.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`\\b${escapedSymbol}\\s*\\(\\s*\\)\\s*;`).test(entrySource)) {
        issues.push(`required registration ${registrationGroup.id} does not invoke ${registration.symbol}`);
      }
    }
  }
  return { valid: issues.length === 0, issues, manifest, inventories };
}

function reportFile(file) {
  const normalized = normalizePath(file ?? "").replace(/^<repository-root>\//, "");
  if (normalized.startsWith("tests/e2e/")) return normalized;
  const marker = "/tests/e2e/";
  const markerIndex = normalized.lastIndexOf(marker);
  return markerIndex >= 0
    ? normalized.slice(markerIndex + 1)
    : `tests/e2e/${normalized.replace(/^\/+/, "")}`;
}

function collectReportTests(suites, inheritedFile = "", result = []) {
  if (!Array.isArray(suites)) return result;
  for (const suite of suites) {
    if (!suite || typeof suite !== "object") continue;
    const suiteFile = typeof suite.file === "string" ? suite.file : inheritedFile;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      if (!spec || typeof spec !== "object") continue;
      const file = reportFile(typeof spec.file === "string" ? spec.file : suiteFile);
      const tests = Array.isArray(spec.tests) ? spec.tests : [];
      if (tests.length === 0) {
        result.push({
          file,
          title: typeof spec.title === "string" ? spec.title : "",
          project: "",
          outcome: "not-run",
          retries: 0,
          annotations: [],
        });
      }
      for (const test of tests) {
        const results = Array.isArray(test?.results) ? test.results : [];
        const finalResult = results[results.length - 1];
        const finalStatus = typeof finalResult?.status === "string" ? finalResult.status : "";
        const retries = Math.max(
          0,
          ...results.map((entry) =>
            Number.isSafeInteger(entry?.retry) ? entry.retry : 0,
          ),
        );
        let outcome = "failed";
        if (results.length === 0) outcome = "not-run";
        else if (test.status === "skipped" || finalStatus === "skipped") outcome = "skipped";
        else if (retries > 0 || results.length > 1 || test.status === "flaky") outcome = "flaky";
        else if (spec.ok === true && test.status === "expected" && finalStatus === "passed") outcome = "passed";
        const annotations = [
          ...(Array.isArray(test.annotations) ? test.annotations : []),
          ...(Array.isArray(finalResult?.annotations) ? finalResult.annotations : []),
        ];
        result.push({
          file,
          title: typeof spec.title === "string" ? spec.title : "",
          project:
            typeof test.projectName === "string"
              ? test.projectName
              : typeof test.projectId === "string"
                ? test.projectId
                : "",
          outcome,
          retries,
          annotations,
        });
      }
    }
    collectReportTests(suite.suites, suiteFile, result);
  }
  return result;
}

function nonEmptyFilter(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function sensitiveKeys(value, currentPath = "report", result = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => sensitiveKeys(entry, `${currentPath}[${index}]`, result));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${currentPath}.${key}`;
      if (SENSITIVE_KEY.test(key)) result.push(childPath);
      sensitiveKeys(child, childPath, result);
    }
  }
  return result;
}

function machineLocalValues(value, currentPath = "report", result = []) {
  if (typeof value === "string") {
    if (/(?:^|[\s"'(])(?:\/(?:Users|home)\/[^/\s]+\/|\/(?:tmp|var\/tmp)\/|\/private\/(?:tmp|var)\/|\/var\/folders\/|[A-Za-z]:[\\/](?:Users|Temp)[\\/])/i.test(value)) {
      result.push(currentPath);
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => machineLocalValues(entry, `${currentPath}[${index}]`, result));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      machineLocalValues(child, `${currentPath}.${key}`, result);
    }
  }
  return result;
}

function leakedSensitiveEnvironmentValues(value, environment) {
  const serialized = JSON.stringify(value);
  const leaks = [];
  for (const [name, candidate] of Object.entries(environment ?? {})) {
    if (
      SENSITIVE_KEY.test(name) &&
      typeof candidate === "string" &&
      candidate.length >= 8 &&
      serialized.includes(candidate)
    ) {
      leaks.push(name);
    }
  }
  return leaks;
}

function expectedSources(manifest, gate, inventories) {
  if (gate.requiredInventory) return inventories.get(gate.requiredInventory) ?? [];
  return (gate.requiredSources ?? []).filter((file) => file.endsWith(".spec.ts"));
}

export function validateRequiredTestReport({
  repositoryRoot,
  gateId,
  report,
  processExitCode,
  requireMetadata = true,
  validateRepository = true,
  expectedSourceCommitSha,
  expectedArtifactSha256,
  environment = process.env,
}) {
  let repository;
  if (validateRepository) {
    repository = validateRequiredTestRepository({ repositoryRoot });
  } else {
    try {
      const manifest = loadRequiredTestManifest(repositoryRoot);
      const gate = manifest.gates.find((entry) => entry.id === gateId);
      const issues = [];
      if (gate) validateGateShape(gate, issues);
      repository = { valid: issues.length === 0, issues, manifest, inventories: new Map() };
    } catch (error) {
      repository = {
        valid: false,
        issues: [error instanceof Error ? error.message : String(error)],
        manifest: null,
        inventories: new Map(),
      };
    }
  }
  const issues = [...repository.issues];
  const gate = repository.manifest?.gates.find((entry) => entry.id === gateId);
  if (!gate) return { valid: false, blocking: true, issues: [...issues, `unknown required-test gate ${gateId}`] };
  if (gate.runner !== "playwright") {
    issues.push(`gate ${gateId} does not use Playwright reporting`);
    return { valid: false, blocking: gate.blocking, issues };
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    issues.push(`gate ${gateId} report is malformed or truncated`);
    return { valid: false, blocking: gate.blocking, issues };
  }
  if (processExitCode !== 0) issues.push(`gate ${gateId} test process exited nonzero`);
  if (report.config?.forbidOnly !== true) {
    issues.push(`gate ${gateId} report does not prove focused .only execution is forbidden`);
  }
  if (
    nonEmptyFilter(report.config?.grep) ||
    nonEmptyFilter(report.config?.grepInvert) ||
    report.config?.shard !== null && report.config?.shard !== undefined
  ) {
    issues.push(`gate ${gateId} report contains an unapproved grep or shard filter`);
  }
  const configFile = normalizePath(report.config?.configFile ?? "").replace(
    /^<repository-root>\//,
    "",
  );
  const rootDir = normalizePath(report.config?.rootDir ?? "").replace(
    /^<repository-root>\//,
    "",
  );
  if (
    gate.playwright?.config &&
    configFile !== gate.playwright.config
  ) {
    issues.push(`gate ${gateId} report was produced by another Playwright configuration`);
  }
  if (rootDir !== "tests/e2e") {
    issues.push(`gate ${gateId} report uses an unexpected test root`);
  }
  const reportProjects = new Set(
    (Array.isArray(report.config?.projects) ? report.config.projects : [])
      .map((project) => project?.name ?? project?.id)
      .filter((name) => typeof name === "string"),
  );
  const requiredProjects = new Set(gate.requiredProjects);
  for (const project of requiredProjects) {
    if (!reportProjects.has(project)) issues.push(`gate ${gateId} required project ${project} is missing`);
  }
  for (const project of reportProjects) {
    if (!requiredProjects.has(project)) issues.push(`gate ${gateId} report includes unexpected project ${project}`);
  }
  if (!gate.allowRetries) {
    for (const project of Array.isArray(report.config?.projects) ? report.config.projects : []) {
      if (project?.retries !== 0) {
        issues.push(`gate ${gateId} project ${project?.name ?? project?.id ?? "unknown"} permits retries`);
      }
      if (project?.repeatEach !== 1) {
        issues.push(`gate ${gateId} project ${project?.name ?? project?.id ?? "unknown"} does not run exactly once`);
      }
    }
  }
  const records = collectReportTests(report.suites);
  const recordIdentities = records.map(
    (record) => `${record.file}\u0000${record.title}\u0000${record.project}`,
  );
  if (new Set(recordIdentities).size !== recordIdentities.length) {
    issues.push(`gate ${gateId} report duplicates a test identity`);
  }
  const discoveredFiles = new Set(records.map((record) => record.file));
  const requiredFiles = new Set(
    expectedSources(repository.manifest, gate, repository.inventories),
  );
  for (const file of requiredFiles) {
    if (!discoveredFiles.has(file)) issues.push(`gate ${gateId} required spec ${file} is missing from the report`);
    for (const project of requiredProjects) {
      if (!records.some((record) => record.file === file && record.project === project)) {
        issues.push(`gate ${gateId} required spec ${file} did not execute in project ${project}`);
      }
    }
  }
  for (const file of discoveredFiles) {
    if (!requiredFiles.has(file)) issues.push(`gate ${gateId} report contains out-of-scope spec ${file}`);
  }
  if (records.length === 0) issues.push(`gate ${gateId} discovered zero tests`);
  for (const record of records) {
    if (!requiredProjects.has(record.project)) {
      issues.push(
        `gate ${gateId} test record uses unexpected project ${record.project || "unknown"}: ${record.file} :: ${record.title}`,
      );
    }
  }
  for (const requirement of gate.requiredTests ?? []) {
    for (const project of gate.requiredProjects) {
      const matches = records.filter(
        (record) =>
          record.file === requirement.file &&
          record.title === requirement.title &&
          record.project === project,
      );
      if (matches.length !== 1) {
        issues.push(
          `gate ${gateId} requirement ${requirement.id} is missing or duplicated for project ${project}`,
        );
      }
    }
  }
  for (const record of records) {
    const identity = `${record.file} :: ${record.title} :: ${record.project || "unknown-project"}`;
    if (record.outcome === "skipped" && !gate.allowSkips) {
      issues.push(`gate ${gateId} required test was skipped: ${identity}`);
    } else if (record.outcome === "flaky" && !gate.allowRetries) {
      issues.push(`gate ${gateId} required test was flaky or retried: ${identity}`);
    } else if (record.outcome === "failed") {
      issues.push(`gate ${gateId} required test failed: ${identity}`);
    } else if (record.outcome === "not-run") {
      issues.push(`gate ${gateId} required test was not run: ${identity}`);
    }
    if (!gate.allowAnnotations && record.annotations.length > 0) {
      issues.push(`gate ${gateId} required test contains an unapproved annotation: ${identity}`);
    }
  }
  const stats = report.stats ?? {};
  const parsedStats = {
    expected: records.filter((record) => record.outcome === "passed").length,
    skipped: records.filter((record) => record.outcome === "skipped").length,
    unexpected: records.filter((record) => record.outcome === "failed" || record.outcome === "not-run").length,
    flaky: records.filter((record) => record.outcome === "flaky").length,
  };
  if (
    stats.expected !== parsedStats.expected ||
    stats.skipped !== parsedStats.skipped ||
    stats.unexpected !== parsedStats.unexpected ||
    stats.flaky !== parsedStats.flaky
  ) {
    issues.push(`gate ${gateId} aggregate counts do not match parsed test results`);
  }
  if (!Number.isSafeInteger(stats.expected) || stats.expected <= 0) {
    issues.push(`gate ${gateId} aggregate report contains zero passing tests`);
  }
  if (stats.unexpected !== 0) issues.push(`gate ${gateId} aggregate report contains failures`);
  if (!gate.allowSkips && stats.skipped !== 0) issues.push(`gate ${gateId} aggregate report contains skips`);
  if (!gate.allowRetries && stats.flaky !== 0) issues.push(`gate ${gateId} aggregate report contains flaky tests`);
  if (Array.isArray(report.errors) && report.errors.length > 0) {
    issues.push(`gate ${gateId} report contains top-level infrastructure errors`);
  }
  const metadata = report.config?.metadata?.requiredTestEvidence;
  if (requireMetadata) {
    if (metadata?.schema !== REQUIRED_TEST_EVIDENCE_SCHEMA || metadata?.gateId !== gateId) {
      issues.push(`gate ${gateId} report metadata does not identify the required gate`);
    }
    if (expectedSourceCommitSha && metadata?.sourceCommitSha !== expectedSourceCommitSha) {
      issues.push(`gate ${gateId} report belongs to another source commit`);
    }
    if (expectedArtifactSha256 && metadata?.artifactSha256 !== expectedArtifactSha256) {
      issues.push(`gate ${gateId} report belongs to another artifact`);
    }
  }
  const secretFields = sensitiveKeys(report);
  if (secretFields.length > 0) {
    issues.push(`gate ${gateId} report contains secret-bearing fields: ${secretFields.join(", ")}`);
  }
  const machineLocalFields = machineLocalValues(report);
  if (machineLocalFields.length > 0) {
    issues.push(`gate ${gateId} report contains machine-local paths: ${machineLocalFields.join(", ")}`);
  }
  const leakedEnvironmentValues = leakedSensitiveEnvironmentValues(report, environment);
  if (leakedEnvironmentValues.length > 0) {
    issues.push(
      `gate ${gateId} report contains sensitive environment values: ${leakedEnvironmentValues.join(", ")}`,
    );
  }
  return {
    valid: issues.length === 0,
    blocking: gate.blocking,
    issues,
    gate,
    records,
    stats,
  };
}

function canonicalizeReportValue(value, repositoryRoots) {
  if (typeof value === "string") {
    let result = value;
    for (const root of repositoryRoots) result = result.split(root).join("<repository-root>");
    return result;
  }
  if (Array.isArray(value)) return value.map((entry) => canonicalizeReportValue(entry, repositoryRoots));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        canonicalizeReportValue(child, repositoryRoots),
      ]),
    );
  }
  return value;
}

export function canonicalizeRequiredTestReport(repositoryRoot, reportPath) {
  const absolutePath = repositoryPath(repositoryRoot, reportPath, "required-test report path");
  const report = readJson(absolutePath, "required-test report");
  const roots = [path.resolve(repositoryRoot)];
  const canonical = canonicalizeReportValue(report, roots);
  writeFileSync(absolutePath, `${JSON.stringify(canonical, null, 2)}\n`);
  return canonical;
}

function canonicalTimestamp(value) {
  return UTC_TIMESTAMP.test(value ?? "") && !Number.isNaN(Date.parse(value));
}

export function validateRequiredTestEvidence({
  repositoryRoot,
  gateId,
  evidencePath,
  expectedSourceCommitSha,
  expectedArtifactSha256,
  expectedBaseURL,
}) {
  const root = path.resolve(repositoryRoot);
  const issues = [];
  let manifest;
  let gate;
  try {
    manifest = loadRequiredTestManifest(root);
    gate = manifest.gates.find((entry) => entry.id === gateId);
  } catch (error) {
    return { valid: false, blocking: true, issues: [error instanceof Error ? error.message : String(error)] };
  }
  if (!gate) return { valid: false, blocking: true, issues: [`unknown required-test gate ${gateId}`] };
  let evidence;
  try {
    evidence = readJson(
      repositoryPath(root, evidencePath, "required-test evidence path"),
      "required-test evidence",
    );
  } catch (error) {
    return { valid: false, blocking: gate.blocking, issues: [error instanceof Error ? error.message : String(error)] };
  }
  if (evidence.schema !== REQUIRED_TEST_EVIDENCE_SCHEMA || evidence.gateId !== gateId) {
    issues.push(`gate ${gateId} evidence schema or identity is invalid`);
  }
  if (!/^[a-f0-9]{40}$/.test(evidence.sourceCommitSha ?? "")) {
    issues.push(`gate ${gateId} evidence source commit identity is missing or invalid`);
  }
  if (
    gate.artifactBinding !== "none" &&
    !/^[a-f0-9]{64}$/.test(evidence.artifactSha256 ?? "")
  ) {
    issues.push(`gate ${gateId} evidence artifact identity is missing or invalid`);
  }
  if (evidence.command !== gate.command) {
    issues.push(`gate ${gateId} evidence command is not canonical`);
  }
  if (evidence.result !== "passed" || !Array.isArray(evidence.diagnostics) || evidence.diagnostics.length > 0) {
    issues.push(`gate ${gateId} evidence contains a failed or unknown result`);
  }
  if (!canonicalTimestamp(evidence.startedAt) || !canonicalTimestamp(evidence.completedAt)) {
    issues.push(`gate ${gateId} evidence timestamps are malformed`);
  } else if (Date.parse(evidence.completedAt) < Date.parse(evidence.startedAt)) {
    issues.push(`gate ${gateId} evidence timestamps are contradictory`);
  } else if (
    Number.isFinite(gate.maxAgeMinutes) &&
    Date.now() - Date.parse(evidence.completedAt) > gate.maxAgeMinutes * 60 * 1000
  ) {
    issues.push(`gate ${gateId} evidence is stale`);
  } else if (
    Number.isFinite(gate.maxAgeMinutes) &&
    Date.parse(evidence.completedAt) - Date.parse(evidence.startedAt) >
      gate.maxAgeMinutes * 60 * 1000
  ) {
    issues.push(`gate ${gateId} evidence process interval exceeds its freshness window`);
  }
  if (
    canonicalTimestamp(evidence.completedAt) &&
    Date.parse(evidence.completedAt) > Date.now() + 5 * 60 * 1000
  ) {
    issues.push(`gate ${gateId} evidence timestamp is in the future`);
  }
  if (expectedSourceCommitSha && evidence.sourceCommitSha !== expectedSourceCommitSha) {
    issues.push(`gate ${gateId} evidence belongs to another source commit`);
  }
  if (expectedArtifactSha256 && evidence.artifactSha256 !== expectedArtifactSha256) {
    issues.push(`gate ${gateId} evidence belongs to another artifact`);
  }
  let report = null;
  try {
    if (evidence.report?.path !== reportPathForGate(gate)) {
      issues.push(`gate ${gateId} evidence report path is not canonical`);
    }
    const reportAbsolutePath = repositoryPath(root, evidence.report?.path, "required-test report path");
    if (!existsSync(reportAbsolutePath) || !statSync(reportAbsolutePath).isFile()) {
      throw new Error(`gate ${gateId} required-test report is missing`);
    }
    const bytes = readFileSync(reportAbsolutePath);
    if (sha256(bytes) !== evidence.report?.sha256) {
      issues.push(`gate ${gateId} report SHA-256 mismatch`);
    }
    report = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    issues.push(
      error instanceof SyntaxError
        ? `gate ${gateId} report is malformed or truncated`
        : error instanceof Error
          ? error.message
          : String(error),
    );
  }
  if (report) {
    const reportResult = validateRequiredTestReport({
      repositoryRoot: root,
      gateId,
      report,
      processExitCode: evidence.processExitCode,
      requireMetadata: true,
      expectedSourceCommitSha: evidence.sourceCommitSha,
      expectedArtifactSha256: evidence.artifactSha256 ?? undefined,
    });
    issues.push(...reportResult.issues);
    const reportStartedAt = report.stats?.startTime;
    const duration = report.stats?.duration;
    if (!canonicalTimestamp(reportStartedAt) || typeof duration !== "number" || duration < 0) {
      issues.push(`gate ${gateId} report timing is missing or malformed`);
    } else {
      const reportStart = Date.parse(reportStartedAt);
      const reportEnd = reportStart + duration;
      if (
        reportStart < Date.parse(evidence.startedAt) - 1000 ||
        reportEnd > Date.parse(evidence.completedAt) + 1000
      ) {
        issues.push(`gate ${gateId} report is stale or outside the recorded process interval`);
      }
      if (
        Number.isFinite(gate.maxAgeMinutes) &&
        Date.now() - reportEnd > gate.maxAgeMinutes * 60 * 1000
      ) {
        issues.push(`gate ${gateId} report is stale even though its evidence envelope is fresh`);
      }
    }
    if (expectedBaseURL && report.config?.metadata?.gateA3ReleaseBaseURL !== expectedBaseURL) {
      issues.push(`gate ${gateId} report targets another staged deployment`);
    }
  }
  return { valid: issues.length === 0, blocking: gate.blocking, issues, evidence, report };
}

function gitHead(repositoryRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("unable to resolve source commit for required-test evidence");
  return result.stdout.trim();
}

export function assertCleanRequiredTestSource(repositoryRoot) {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("unable to inspect source cleanliness for required-test evidence");
  }
  if (result.stdout.trim().length > 0) {
    throw new Error("release-blocking required-test evidence requires a clean source checkout");
  }
}

function reportPathForGate(gate) {
  const evidenceDirectory = path.posix.dirname(gate.reportPath);
  return gate.id === "release.gate-a3"
    ? ".vercel/gate-a3-playwright.json"
    : `${evidenceDirectory}/playwright.json`;
}

export function removeUnsafeRequiredTestArtifacts({ repositoryRoot, gateId, reportPath }) {
  const reportAbsolutePath = repositoryPath(
    repositoryRoot,
    reportPath,
    "unsafe required-test report path",
  );
  if (existsSync(reportAbsolutePath)) rmSync(reportAbsolutePath);
  const outputPath = repositoryPath(
    repositoryRoot,
    `.local/required-test-evidence/${gateId}/playwright-output`,
    "unsafe required-test output path",
  );
  if (existsSync(outputPath)) rmSync(outputPath, { recursive: true, force: true });
}

export function requiredTestArtifactsAreUnsafe({ reportWasParsed, validationIssues }) {
  return (
    !reportWasParsed ||
    validationIssues.some((issue) =>
      /secret-bearing fields|sensitive environment values|machine-local paths/.test(issue),
    )
  );
}

export function runRequiredPlaywrightGate({
  repositoryRoot,
  gateId,
  environment = process.env,
}) {
  const root = path.resolve(repositoryRoot);
  const repository = validateRequiredTestRepository({ repositoryRoot: root });
  if (!repository.valid) throw new Error(repository.issues.join("; "));
  const gate = repository.manifest.gates.find((entry) => entry.id === gateId);
  if (!gate || gate.runner !== "playwright" || gate.reportType !== "required-test-evidence") {
    throw new Error(`gate ${gateId} is not a runnable required Playwright gate`);
  }
  if (gate.cadence === "release-blocking") assertCleanRequiredTestSource(root);
  const sourceCommitSha = gitHead(root);
  const artifactSha256 = environment.REQUIRED_TEST_ARTIFACT_SHA256?.trim() || null;
  if (gate.artifactBinding !== "none" && !/^[a-f0-9]{64}$/.test(artifactSha256 ?? "")) {
    throw new Error(`gate ${gateId} requires REQUIRED_TEST_ARTIFACT_SHA256`);
  }
  if (gate.cadence === "release-blocking" && !environment.PLAYWRIGHT_RELEASE_BASE_URL?.trim()) {
    throw new Error(`gate ${gate.id} requires PLAYWRIGHT_RELEASE_BASE_URL`);
  }
  if (
    gate.id === "release.cabinetry-browser" &&
    (!environment.REQUIRED_TEST_RELEASE_CANDIDATE_ID?.trim() ||
      !environment.REQUIRED_TEST_RELEASE_ENVIRONMENT?.trim())
  ) {
    throw new Error(
      "release.cabinetry-browser requires REQUIRED_TEST_RELEASE_CANDIDATE_ID and REQUIRED_TEST_RELEASE_ENVIRONMENT",
    );
  }
  const reportPath = reportPathForGate(gate);
  const reportAbsolutePath = repositoryPath(root, reportPath, "required-test report path");
  const evidenceAbsolutePath = repositoryPath(root, gate.reportPath, "required-test evidence path");
  mkdirSync(path.dirname(reportAbsolutePath), { recursive: true });
  if (existsSync(reportAbsolutePath)) rmSync(reportAbsolutePath);
  if (existsSync(evidenceAbsolutePath)) rmSync(evidenceAbsolutePath);
  const startedAt = new Date().toISOString();
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawnSync(executable, gate.playwright.args, {
    cwd: root,
    env: {
      ...environment,
      REQUIRED_TEST_GATE_ID: gateId,
      REQUIRED_TEST_REPORT_PATH: reportPath,
      REQUIRED_TEST_SOURCE_COMMIT_SHA: sourceCommitSha,
      REQUIRED_TEST_ARTIFACT_SHA256: artifactSha256 ?? "",
    },
    stdio: "inherit",
  });
  const completedAt = new Date().toISOString();
  const processExitCode = Number.isInteger(child.status) ? child.status : 1;
  let report = null;
  let reportHash = null;
  let reportWasParsed = false;
  const validationIssues = [];
  if (!existsSync(reportAbsolutePath)) {
    validationIssues.push(`gate ${gateId} required report is missing`);
  } else {
    try {
      report = canonicalizeRequiredTestReport(root, reportPath);
      reportWasParsed = true;
      reportHash = sha256(readFileSync(reportAbsolutePath));
      const result = validateRequiredTestReport({
        repositoryRoot: root,
        gateId,
        report,
        processExitCode,
        requireMetadata: true,
        expectedSourceCommitSha: sourceCommitSha,
        expectedArtifactSha256: artifactSha256 ?? undefined,
        environment,
      });
      validationIssues.push(...result.issues);
    } catch (error) {
      validationIssues.push(error instanceof Error ? error.message : String(error));
    }
  }
  const unsafeReport = requiredTestArtifactsAreUnsafe({ reportWasParsed, validationIssues });
  if (unsafeReport) {
    removeUnsafeRequiredTestArtifacts({ repositoryRoot: root, gateId, reportPath });
    report = null;
    reportHash = null;
  }
  const evidence = {
    schema: REQUIRED_TEST_EVIDENCE_SCHEMA,
    gateId,
    command: gate.command,
    sourceCommitSha,
    artifactSha256,
    processExitCode,
    startedAt,
    completedAt,
    report: { path: reportPath, sha256: reportHash },
    result: validationIssues.length === 0 ? "passed" : "failed",
    diagnostics: validationIssues,
  };
  writeFileSync(evidenceAbsolutePath, `${JSON.stringify(evidence, null, 2)}\n`);
  if (validationIssues.length > 0) {
    throw new Error(validationIssues.join("; "));
  }
  return evidence;
}

async function cli() {
  const repositoryRoot = process.cwd();
  const command = process.argv[2];
  if (command === "check") {
    const result = validateRequiredTestRepository({ repositoryRoot });
    if (!result.valid) throw new Error(result.issues.join("; "));
    console.log(
      `Required-test manifest valid: ${result.manifest.gates.length} gates, ${[...result.inventories.values()].reduce((total, files) => total + files.length, 0)} classified test sources.`,
    );
  } else if (command === "run" && process.argv[3]) {
    const evidence = runRequiredPlaywrightGate({ repositoryRoot, gateId: process.argv[3] });
    console.log(`Required-test gate ${evidence.gateId} passed truthfulness validation.`);
  } else if (command === "verify" && process.argv[3]) {
    const manifest = loadRequiredTestManifest(repositoryRoot);
    const gate = manifest.gates.find((entry) => entry.id === process.argv[3]);
    const evidencePath = process.argv[4] ?? gate?.reportPath;
    if (!evidencePath) throw new Error(`gate ${process.argv[3]} has no evidence path`);
    const result = validateRequiredTestEvidence({
      repositoryRoot,
      gateId: process.argv[3],
      evidencePath,
    });
    if (!result.valid) throw new Error(result.issues.join("; "));
    console.log(`Required-test evidence ${process.argv[3]} is valid.`);
  } else {
    throw new Error(
      "Usage: required-test-truthfulness.mjs check|run <gate-id>|verify <gate-id> [evidence-path]",
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
