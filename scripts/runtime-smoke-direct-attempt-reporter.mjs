import { createHash } from "node:crypto";
import {
  mkdirSync,
  lstatSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

export function runtimeSmokeDirectAttemptResultPath({ outputRoot, identity }) {
  const digest = createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex")
    .slice(0, 20);
  return path.join(
    outputRoot,
    `${safeSegment(identity.projectName)}-repeat-${identity.repeatEachIndex}` +
      `-retry-${identity.retry}-worker-${identity.workerIndex}` +
      `-pid-${identity.processId}-${digest}.json`,
  );
}

export default class RuntimeSmokeDirectAttemptReporter {
  constructor(options = {}) {
    this.outputDirectory = options.outputRoot ?? path.join(
      process.cwd(),
      "test-results",
      "runtime-smoke-direct-attempts",
    );
    this.timingRoot = path.resolve(
      options.timingRoot ?? path.join(process.cwd(), "test-results"),
    );
    this.records = [];
  }

  onTestEnd(test, result) {
    if (process.env.CERTIFICATION_ENVIRONMENT_STAGE === "runtime-smoke") return;
    if (test.title !== "furnished template remains stable without a render loop") return;
    const timingAnnotation = test.annotations.find(
      (annotation) => annotation.type === "runtime-smoke-direct-timing-path",
    );
    const timingPath = path.resolve(timingAnnotation?.description ?? "");
    if (
      !timingAnnotation?.description ||
      !timingPath.startsWith(`${this.timingRoot}${path.sep}`) ||
      !/^phase-timings-\d+\.json$/.test(path.basename(timingPath))
    ) {
      throw new Error("runtime-smoke direct timing destination is invalid");
    }
    const timingMetadata = lstatSync(timingPath);
    if (!timingMetadata.isFile() || timingMetadata.isSymbolicLink()) {
      throw new Error("runtime-smoke direct timing destination is not a physical file");
    }
    const timing = JSON.parse(readFileSync(timingPath, "utf8"));
    const attempt = timing.attemptIdentity;
    if (
      attempt?.schema !== "interior-ai.runtime-smoke-direct-attempt.v1" ||
      attempt.repeatEachIndex !== test.repeatEachIndex ||
      attempt.retry !== result.retry ||
      attempt.workerIndex !== result.workerIndex ||
      attempt.parallelIndex !== result.parallelIndex ||
      attempt.projectName !== (test.parent.project()?.name ?? "unknown") ||
      attempt.testId !== test.id
    ) {
      throw new Error("runtime-smoke direct timing identity is inconsistent");
    }
    const identity = {
      ...attempt,
      schema: "interior-ai.runtime-smoke-direct-result.v1",
      status: result.status,
    };
    mkdirSync(this.outputDirectory, { recursive: true });
    const outputPath = runtimeSmokeDirectAttemptResultPath({
      outputRoot: this.outputDirectory,
      identity,
    });
    writeFileSync(outputPath, `${JSON.stringify(identity, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    unlinkSync(timingPath);
    this.records.push({ identity, outputPath, timingPath });
  }

  onEnd() {
    if (this.records.length === 0) return;
    const paths = new Set();
    const timingPaths = new Set();
    const identities = new Set();
    const statuses = {};
    for (const record of this.records) {
      const actual = JSON.parse(readFileSync(record.outputPath, "utf8"));
      const expectedBytes = JSON.stringify(record.identity);
      if (JSON.stringify(actual) !== expectedBytes) {
        throw new Error("runtime-smoke direct attempt read another identity");
      }
      paths.add(record.outputPath);
      timingPaths.add(record.timingPath);
      identities.add(expectedBytes);
      statuses[record.identity.status] = (statuses[record.identity.status] ?? 0) + 1;
    }
    if (
      paths.size !== this.records.length ||
      timingPaths.size !== this.records.length ||
      identities.size !== this.records.length
    ) {
      throw new Error("runtime-smoke direct attempt ownership collided");
    }
    const identitySha256 = createHash("sha256")
      .update([...identities].sort().join("\n"))
      .digest("hex");
    rmSync(this.outputDirectory, { recursive: true });
    console.log(
      "RUNTIME_SMOKE_DIRECT_ATTEMPT_OWNERSHIP_RESULT",
      JSON.stringify({
        schema: "interior-ai.runtime-smoke-direct-attempt-ownership.v1",
        attemptCount: this.records.length,
        uniqueTimingDestinationCount: timingPaths.size,
        uniqueResultIdentityCount: identities.size,
        uniqueResultPathCount: paths.size,
        identitySha256,
        statuses,
        outputCleaned: true,
      }),
    );
  }
}
