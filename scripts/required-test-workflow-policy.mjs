import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";

export function assertRequiredWorkflowRouting(required, advisory) {
  const approvedPrTargets = ["main", "develop", "staging", "integration/deep-clean-v1"];
  assert.deepEqual(Object.keys(required.on).sort(), ["pull_request", "push", "workflow_dispatch"]);
  assert.deepEqual(required.on.pull_request, { branches: approvedPrTargets },
    "required CI must retain its approved PR targets and default activity types");
  assert.deepEqual(required.on.push, { branches: ["main", "develop", "staging"] });
  assert.equal(required.on.workflow_dispatch, null);
  assert.deepEqual(Object.keys(advisory.on).sort(), ["pull_request", "schedule", "workflow_dispatch"]);
  assert.deepEqual(Object.keys(advisory.on.pull_request).sort(), ["branches", "types"]);
  assert.deepEqual(advisory.on.pull_request.branches, approvedPrTargets,
    "full advisory must retain exactly the approved PR targets");
  assert.deepEqual(advisory.on.pull_request.types, ["labeled"],
    "ordinary PR synchronize events must not launch the full advisory workflow");
  assert.equal(advisory.jobs["e2e-full"].if.replace(/\s+/g, " ").trim(),
    "github.event_name == 'workflow_dispatch' || github.event_name == 'schedule' || " +
      "(github.event_name == 'pull_request' && github.event.action == 'labeled' && " +
      "github.event.label.name == 'run-full-e2e')",
    "full advisory PR execution must require the run-full-e2e label");
  assert.deepEqual(advisory.on.schedule, [{ cron: "17 2 * * *" }]);
  assert.deepEqual(advisory.on.workflow_dispatch, {
    inputs: { source_sha: { description: "Exact 40-character commit SHA to test", required: true, type: "string" } },
  });
  for (const workflow of [required, advisory]) {
    assert.deepEqual(workflow.permissions, { contents: "read" });
  }
}

export function validateRequiredWorkflowRouting(requiredWorkflow, advisoryWorkflow) {
  try {
    assertRequiredWorkflowRouting(parseYaml(requiredWorkflow), parseYaml(advisoryWorkflow));
    return [];
  } catch (error) {
    return [`required workflow routing policy is invalid: ${error.message}`];
  }
}
