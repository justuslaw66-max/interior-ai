import { execFileSync } from "node:child_process";

export const DEFAULT_TRACKED_ARTIFACT_POLICY = Object.freeze({
  forbiddenGeneratedRoots: Object.freeze([
    "test-results",
    "playwright-report",
    ".next",
    ".local",
  ]),
  databaseFixturePaths: Object.freeze([]),
  intentionalTrackedIgnoredPaths: Object.freeze([]),
});

const MUTABLE_DATABASE_PATTERN = /(?:^|\/)[^/]+\.(?:db|db-journal|sqlite|sqlite3)$/i;

export function normalizeRepositoryPath(value) {
  if (typeof value !== "string") {
    throw new TypeError("repository path must be a string");
  }
  return value
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/");
}

function normalizedSet(paths) {
  return new Set(paths.map(normalizeRepositoryPath));
}

function belongsToRoot(repositoryPath, root) {
  return repositoryPath === root || repositoryPath.startsWith(`${root}/`);
}

function gitPathList(repositoryRoot, arguments_) {
  const output = execFileSync("git", [...arguments_, "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split("\0")
    .filter(Boolean)
    .map(normalizeRepositoryPath);
}

export function evaluateTrackedArtifactHygiene({
  trackedPaths,
  ignoredTrackedPaths = [],
  policy = DEFAULT_TRACKED_ARTIFACT_POLICY,
}) {
  const tracked = [...normalizedSet(trackedPaths)].sort((left, right) => left.localeCompare(right));
  const ignoredTracked = normalizedSet(ignoredTrackedPaths);
  const databaseFixtures = normalizedSet(policy.databaseFixturePaths ?? []);
  const intentionalTrackedIgnored = normalizedSet(policy.intentionalTrackedIgnoredPaths ?? []);
  const generatedRoots = (policy.forbiddenGeneratedRoots ?? [])
    .map(normalizeRepositoryPath);
  const failures = [];

  for (const repositoryPath of tracked) {
    const generatedRoot = generatedRoots.find((root) => belongsToRoot(repositoryPath, root));
    if (generatedRoot) {
      failures.push({
        code: "TRACKED_GENERATED_OUTPUT",
        path: repositoryPath,
        message: `Generated output under ${generatedRoot}/ must be removed from Git; keep it ignored and regenerate it locally.`,
      });
      continue;
    }
    if (MUTABLE_DATABASE_PATTERN.test(repositoryPath) && !databaseFixtures.has(repositoryPath)) {
      failures.push({
        code: "TRACKED_MUTABLE_DATABASE",
        path: repositoryPath,
        message: "Mutable local database artifacts must not be tracked; use a reviewed, exact-path databaseFixturePaths entry only for a deterministic fixture.",
      });
      continue;
    }
    if (
      ignoredTracked.has(repositoryPath) &&
      !databaseFixtures.has(repositoryPath) &&
      !intentionalTrackedIgnored.has(repositoryPath)
    ) {
      failures.push({
        code: "TRACKED_IGNORED_FILE",
        path: repositoryPath,
        message: "This path is both tracked and ignored. Remove it from Git or add a narrow reviewed policy entry with a documented owner.",
      });
    }
  }

  return failures;
}

export function inspectTrackedArtifactHygiene(
  repositoryRoot,
  policy = DEFAULT_TRACKED_ARTIFACT_POLICY,
) {
  return evaluateTrackedArtifactHygiene({
    trackedPaths: gitPathList(repositoryRoot, ["ls-files"]),
    ignoredTrackedPaths: gitPathList(repositoryRoot, ["ls-files", "-ci", "--exclude-standard"]),
    policy,
  });
}
