import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { assertWindowOpeningReportContext } from "./window-opening-browser-context.mjs";

export const REQUIRED_TEST_MANIFEST_SCHEMA =
  "interior-ai.required-test-manifest.v1";
export const REQUIRED_TEST_EVIDENCE_SCHEMA =
  "interior-ai.required-test-evidence.v1";
export const DEFAULT_MANIFEST_PATH = "scripts/required-test-manifest.json";
export const SENSITIVE_KEY =
  /(secret|token|password|private.?key|api.?key|access.?key|cookie|database.?url|credential)/i;
export function normalizePath(value) {
  return value.split(path.sep).join("/");
}

export function repositoryPath(repositoryRoot, relativePath, description) {
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

export function readJson(absolutePath, description) {
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

export function validateGateShape(gate, issues) {
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
  if (
    gate.requiredCommandSources !== undefined &&
    (!Array.isArray(gate.requiredCommandSources) ||
      gate.requiredCommandSources.some((source) => typeof source !== "string" || source.length === 0))
  ) {
    issues.push(`gate ${gate.id} has malformed required command-source coverage`);
  }
  if (
    gate.forbiddenCommandFragments !== undefined &&
    (!Array.isArray(gate.forbiddenCommandFragments) ||
      gate.forbiddenCommandFragments.some(
        (fragment) => typeof fragment !== "string" || fragment.length === 0,
      ))
  ) {
    issues.push(`gate ${gate.id} has malformed forbidden command fragments`);
  }
  if (
    gate.forbidCommandFailureSwallowing !== undefined &&
    typeof gate.forbidCommandFailureSwallowing !== "boolean"
  ) {
    issues.push(`gate ${gate.id} has malformed command failure-swallowing policy`);
  }
  const contributionIds = new Set();
  for (const contribution of gate.requiredContributions ?? []) {
    if (!/^[a-z0-9][a-z0-9.-]+$/.test(contribution.id ?? "")) {
      issues.push(`gate ${gate.id} has an invalid required contribution ID`);
    } else if (contributionIds.has(contribution.id)) {
      issues.push(`gate ${gate.id} duplicates required contribution ${contribution.id}`);
    }
    contributionIds.add(contribution.id);
    if (
      typeof contribution.source !== "string" ||
      contribution.source.length === 0 ||
      typeof contribution.marker !== "string" ||
      contribution.marker.length === 0
    ) {
      issues.push(`gate ${gate.id} has an incomplete required contribution ${contribution.id}`);
    }
  }
  if (
    gate.ci?.workflow !== undefined &&
    (typeof gate.ci.workflow !== "string" ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(gate.ci.workflow))
  ) {
    issues.push(`gate ${gate.id} has an invalid CI workflow owner`);
  }
  for (const [field, values] of [
    ["steps", gate.ci?.steps],
    ["afterSteps", gate.ci?.afterSteps],
    ["invocations", gate.ci?.invocations],
  ]) {
    if (
      values !== undefined &&
      (!Array.isArray(values) ||
        values.some((value) => typeof value !== "string" || value.length === 0))
    ) {
      issues.push(`gate ${gate.id} has malformed CI ${field}`);
    }
  }
  if (
    gate.ci?.stepInvocations !== undefined &&
    !Array.isArray(gate.ci.stepInvocations)
  ) {
    issues.push(`gate ${gate.id} has malformed CI step invocation bindings`);
  } else {
    for (const binding of gate.ci?.stepInvocations ?? []) {
      if (
        typeof binding?.step !== "string" ||
        binding.step.length === 0 ||
        typeof binding?.invocation !== "string" ||
        binding.invocation.length === 0
      ) {
        issues.push(`gate ${gate.id} has malformed CI step invocation binding`);
      }
    }
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

export function resolveRegisteredModulePath(repositoryRoot, entryPath, modulePath) {
  const basePath = normalizePath(
    path.posix.join(path.posix.dirname(entryPath), modulePath),
  );
  const candidates = /\.[A-Za-z0-9]+$/.test(basePath)
    ? [basePath]
    : [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.mjs`, `${basePath}.js`];
  return candidates.find((candidate) => {
    const absolutePath = path.join(repositoryRoot, candidate);
    return existsSync(absolutePath) && statSync(absolutePath).isFile();
  }) ?? null;
}

export function reportOwnershipAliases(manifest, gate, inventories, repositoryRoot, issues) {
  const aliases = new Map();
  const runnableSources = new Set(expectedSources(manifest, gate, inventories));
  const supportingSources = new Set(
    (gate.supportingInventories ?? []).flatMap(
      (inventoryId) => inventories.get(inventoryId) ?? [],
    ),
  );
  const registrationGroups = new Map(
    (manifest.requiredRegistrations ?? []).map((group) => [group.id, group]),
  );
  const requiredOwnershipGroups = (manifest.requiredRegistrations ?? []).filter(
    (group) =>
      runnableSources.has(group.entry) &&
      group.entry.endsWith(".spec.ts") &&
      (group.registrations ?? []).length > 0,
  );
  const selectedGroupIds = gate.reportOwnershipRegistrations ?? [];
  const selectedGroupIdSet = new Set(selectedGroupIds);
  if (selectedGroupIdSet.size !== selectedGroupIds.length) {
    issues.push(`gate ${gate.id} duplicates an aggregator ownership registration group`);
  }
  for (const group of requiredOwnershipGroups) {
    if (!selectedGroupIdSet.has(group.id)) {
      issues.push(
        `gate ${gate.id} omits aggregator ownership registration group ${group.id}`,
      );
    }
  }
  for (const groupId of selectedGroupIds) {
    const group = registrationGroups.get(groupId);
    if (!group) {
      issues.push(`gate ${gate.id} references unknown aggregator ownership group ${groupId}`);
      continue;
    }
    if (!runnableSources.has(group.entry) || !group.entry.endsWith(".spec.ts")) {
      issues.push(
        `gate ${gate.id} aggregator owner ${group.entry} is not a runnable required spec`,
      );
    }
    for (const registration of group.registrations ?? []) {
      const source = resolveRegisteredModulePath(
        repositoryRoot,
        group.entry,
        registration.module,
      );
      if (!source) {
        issues.push(
          `required registration ${group.id} module ${registration.module} is missing`,
        );
        continue;
      }
      if (!supportingSources.has(source)) {
        issues.push(
          `gate ${gate.id} registered imported module ${source} is not classified by a supporting inventory`,
        );
      }
      if (aliases.has(source)) {
        issues.push(
          `gate ${gate.id} imported module ${source} has more than one aggregator owner`,
        );
      } else {
        aliases.set(source, group.entry);
      }
    }
  }
  return aliases;
}

function reportFile(file, testRoot) {
  const normalized = normalizePath(file ?? "").replace(/^<repository-root>\//, "");
  if (normalized.startsWith(`${testRoot}/`)) return normalized;
  const marker = `/${testRoot}/`;
  const markerIndex = normalized.lastIndexOf(marker);
  return markerIndex >= 0
    ? normalized.slice(markerIndex + 1)
    : `${testRoot}/${normalized.replace(/^\/+/, "")}`;
}

export function collectReportTests(suites, testRoot, inheritedFile = "", result = []) {
  if (!Array.isArray(suites)) return result;
  for (const suite of suites) {
    if (!suite || typeof suite !== "object") continue;
    const suiteFile = typeof suite.file === "string" ? suite.file : inheritedFile;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      if (!spec || typeof spec !== "object") continue;
      const file = reportFile(
        typeof spec.file === "string" ? spec.file : suiteFile,
        testRoot,
      );
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
    collectReportTests(suite.suites, testRoot, suiteFile, result);
  }
  return result;
}

function nonEmptyFilter(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

export function sensitiveKeys(value, currentPath = "report", result = []) {
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
  sourceRepositoryValidator,
  expectedSourceCommitSha,
  expectedArtifactSha256,
  expectedWindowOpeningRunId,
  environment = process.env,
}) {
  let repository;
  if (validateRepository) {
    if (typeof sourceRepositoryValidator !== "function") {
      throw new Error("Full repository report validation requires the source-repository driver.");
    }
    repository = sourceRepositoryValidator({ repositoryRoot });
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
  const expectedTestRoot = normalizePath(
    gate.playwright?.testRoot ?? "tests/e2e",
  ).replace(/^<repository-root>\//, "");
  if (rootDir !== expectedTestRoot) {
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
  const ownershipIssues = [];
  const ownershipAliases = reportOwnershipAliases(
    repository.manifest,
    gate,
    repository.inventories,
    path.resolve(repositoryRoot),
    ownershipIssues,
  );
  issues.push(...ownershipIssues);
  const reportedRecords = collectReportTests(report.suites, expectedTestRoot);
  for (const importedModule of ownershipAliases.keys()) {
    for (const project of requiredProjects) {
      if (
        !reportedRecords.some(
          (record) => record.file === importedModule && record.project === project,
        )
      ) {
        issues.push(
          `gate ${gateId} registered imported module ${importedModule} did not contribute test records in project ${project}`,
        );
      }
    }
  }
  const records = reportedRecords.map((record) => ({
    ...record,
    reportedFile: record.file,
    file: ownershipAliases.get(record.file) ?? record.file,
  }));
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
  if (requireMetadata) {
    try { assertWindowOpeningReportContext(report.config?.metadata, gateId, {
      repositoryRoot, config: report.config, expectedRunId: expectedWindowOpeningRunId,
    }); }
    catch (error) { issues.push(error.message); }
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
