import { writeFileSync } from "node:fs";

function markerValue(options, details) {
  return {
    schema: "interior-ai.production-certification-playwright-start.v1",
    boundary: options.boundary,
    gateId: options.gateId,
    ...details,
  };
}

export default class CertificationPlaywrightStartReporter {
  constructor(options = {}) {
    if (
      typeof options.markerPath !== "string" ||
      !options.markerPath ||
      !["discovery", "test-begin"].includes(options.boundary) ||
      typeof options.gateId !== "string" ||
      !options.gateId
    ) {
      throw new Error("certification Playwright start reporter options are invalid");
    }
    this.options = options;
    this.written = false;
  }

  write(details) {
    if (this.written) return;
    writeFileSync(
      this.options.markerPath,
      `${JSON.stringify(markerValue(this.options, details), null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    this.written = true;
  }

  onBegin(_config, suite) {
    if (this.options.boundary !== "discovery") return;
    this.write({ discoveredTestCount: suite.allTests().length });
  }

  onTestBegin(test, result) {
    if (this.options.boundary !== "test-begin") return;
    const project =
      typeof test.parent?.project === "function"
        ? test.parent.project()?.name ?? null
        : null;
    this.write({
      project,
      title: test.title,
      retry: result.retry,
    });
  }
}
