import assert from "node:assert/strict";
import { errors, type Locator } from "@playwright/test";
import { ensureEditorWorkspaceMenuOpen } from "../tests/e2e/variant-test-utils";

async function main() {
  let cases = 0;
  async function check(input: {
    initial: string | null;
    afterClick?: string | null;
    failure?: unknown;
    getterFailure?: "initial" | "after-click";
    expectedFailure?: unknown;
  }) {
    let expanded = input.initial;
    const clicks: Parameters<Locator["click"]>[0][] = [];
    const getterError = new Error("expanded state unavailable");
    const trigger: Pick<Locator, "click" | "getAttribute"> = {
      async getAttribute(name) {
        assert.equal(name, "aria-expanded");
        if (input.getterFailure === "initial" ||
            (input.getterFailure === "after-click" && clicks.length > 0)) {
          throw getterError;
        }
        return expanded;
      },
      async click(options) {
        clicks.push(options);
        expanded = input.afterClick ?? null;
        if ("failure" in input) throw input.failure;
      },
    };
    const operation = ensureEditorWorkspaceMenuOpen(trigger);
    if (input.getterFailure === "initial") {
      await assert.rejects(operation, (cause) => cause === getterError);
    } else if ("expectedFailure" in input) {
      await assert.rejects(operation, (cause) => cause === input.expectedFailure);
    } else {
      await operation;
      assert.equal(expanded, "true");
    }
    assert.deepEqual(clicks,
      input.initial === "true" || input.getterFailure === "initial"
        ? [] : [{ timeout: 5000 }]);
    cases += 1;
  }

  await check({ initial: "false", afterClick: "true" });
  await check({ initial: "true" });
  const timeout = new errors.TimeoutError("native post-action wait expired");
  await check({ initial: "false", afterClick: "true", failure: timeout });
  for (const afterClick of ["false", null, "TRUE", "1"]) {
    await check({ initial: "false", afterClick, failure: timeout, expectedFailure: timeout });
  }
  for (const failure of [new Error("click failed"), { name: "TimeoutError" }, "failure", null, undefined]) {
    await check({ initial: "false", afterClick: "true", failure, expectedFailure: failure });
  }
  await check({ initial: "false", getterFailure: "initial" });
  await check({ initial: "false", afterClick: "true", failure: timeout,
    getterFailure: "after-click", expectedFailure: timeout });
  console.log(`Editor workspace menu helper: ${cases} deterministic cases passed.`);
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
