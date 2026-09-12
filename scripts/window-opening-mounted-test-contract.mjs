import fs from "node:fs/promises";

export const MOUNTED_TEST_INVENTORY_PATH = new URL(
  "./window-opening-mounted-tests.json", import.meta.url
);

export async function loadWindowOpeningMountedTestInventory() {
  const inventory = JSON.parse(await fs.readFile(MOUNTED_TEST_INVENTORY_PATH, "utf8"));
  if (!Array.isArray(inventory) || inventory.length !== 12) {
    throw new Error("The canonical mounted test inventory must contain exactly 12 tests.");
  }
  for (const key of ["id", "playwrightId", "title"]) {
    if (new Set(inventory.map((entry) => entry[key])).size !== inventory.length) {
      throw new Error(`The canonical mounted test inventory has duplicate ${key} values.`);
    }
  }
  return inventory;
}

function reportSpecs(report) {
  return (report.suites ?? []).flatMap((suite) => (suite.specs ?? []).map((spec) => ({
    ...spec,
    file: suite.file ?? suite.title,
  })));
}

export async function verifyWindowOpeningMountedReport(report, runContract = {}) {
  if (runContract.sealable !== true) {
    throw new Error("An advisory or filtered mounted run is not sealable.");
  }
  if ((runContract.filters ?? []).length !== 0) {
    throw new Error("A sealable mounted run must not contain suite filters.");
  }
  const inventory = await loadWindowOpeningMountedTestInventory();
  const specs = reportSpecs(report);
  if (specs.length !== inventory.length) {
    throw new Error(`Mounted report executed ${specs.length} tests; expected ${inventory.length}.`);
  }
  const expectedByPlaywrightId = new Map(inventory.map((entry) => [entry.playwrightId, entry]));
  const executed = [];
  for (const spec of specs) {
    const expected = expectedByPlaywrightId.get(spec.id);
    if (!expected || spec.title !== expected.title || spec.file !== expected.file) {
      throw new Error(`Mounted report contains an unexpected or replaced test: ${spec.id}.`);
    }
    if (spec.tests?.length !== 1) {
      throw new Error(`Mounted test ${expected.id} did not run exactly once.`);
    }
    const test = spec.tests[0];
    const results = test.results ?? [];
    if (test.projectName !== expected.project || test.status !== "expected" ||
        spec.ok !== true || results.length !== 1 || results[0].status !== "passed" ||
        results[0].retry !== 0) {
      throw new Error(`Mounted test ${expected.id} was skipped, flaky, failed, or used the wrong project.`);
    }
    executed.push({
      id: expected.id,
      playwrightId: expected.playwrightId,
      title: expected.title,
      file: expected.file,
      project: expected.project,
      status: "passed",
      retry: 0,
    });
  }
  const executedIds = new Set(executed.map((entry) => entry.id));
  const missing = inventory.filter((entry) => !executedIds.has(entry.id));
  if (missing.length) throw new Error(`Mounted report is missing required tests: ${missing.map((entry) => entry.id).join(", ")}.`);
  return {
    expectedCount: inventory.length,
    expectedIds: inventory.map((entry) => entry.id),
    executedIds: executed.map((entry) => entry.id),
    executed,
    project: "chromium",
    files: ["window-opening-corrections.spec.ts"],
    filters: [],
    sealable: true,
  };
}
