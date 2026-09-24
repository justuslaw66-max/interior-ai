import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  parseFloorPlanVectorizerEvidence,
  type FloorPlanVectorizerEvidence,
} from "./vectorizer-evidence-schema";

/**
 * Process boundary for the local floor-plan vectorizer (services/floorplan-vectorizer).
 * Nothing leaves the machine: the page is written to a private temporary folder,
 * the two Python programs run there with a bounded timeout, and the folder is removed.
 */

export type FloorPlanVectorizerPage = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  mimeType: string;
  bytes: Uint8Array;
};

/** Server-local boundary. Implementations must not upload page bytes. */
export interface FloorPlanVectorizerProvider {
  readonly id: string;
  analyzePage(
    page: FloorPlanVectorizerPage,
    options: { timeoutMs: number; signal?: AbortSignal }
  ): Promise<FloorPlanVectorizerEvidence>;
}

// The Python programs are run from the repository, never bundled. The directory is kept relative
// and resolved by the operating system against the server's working directory when the process is
// spawned: any path built here from process.cwd() would be read by Next's output file tracer as a
// directory to copy into the standalone build (Turbopack falls back to the whole working directory
// when it cannot evaluate the expression). next.config excludes services/ from tracing as well.
const DEFAULT_VECTORIZER_DIRECTORY = "services/floorplan-vectorizer";

export function floorPlanVectorizerRuntimeConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  const timeout = Number.parseInt(environment.FLOOR_PLAN_VECTORIZER_TIMEOUT_MS ?? "", 10);
  return Object.freeze({
    enabled: environment.FLOOR_PLAN_VECTORIZER_ENABLED === "1",
    pythonPath: environment.FLOOR_PLAN_VECTORIZER_PYTHON || "python3",
    directory: environment.FLOOR_PLAN_VECTORIZER_DIR || DEFAULT_VECTORIZER_DIRECTORY,
    timeoutMs: Number.isFinite(timeout) ? Math.max(10_000, Math.min(timeout, 900_000)) : 420_000,
  });
}

function runProcess(
  command: string,
  args: string[],
  options: { timeoutMs: number; signal?: AbortSignal }
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      child.kill("SIGKILL");
      finish(new Error("Floor-plan vectorizer was cancelled"));
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`Floor-plan vectorizer exceeded ${options.timeoutMs} ms`));
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 4_000) stderr += chunk.toString("utf8");
    });
    child.on("error", (cause) => finish(cause));
    child.on("close", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(`Floor-plan vectorizer exited with ${code}: ${stderr.trim().split("\n").at(-1) ?? ""}`)
      )
    );
  });
}

/** Runs the two Python programs on a private temporary copy of the page and removes it afterwards. */
export class PythonFloorPlanVectorizerProvider implements FloorPlanVectorizerProvider {
  readonly id = "python-floorplan-vectorizer";

  constructor(private readonly config = floorPlanVectorizerRuntimeConfiguration()) {}

  async analyzePage(
    page: FloorPlanVectorizerPage,
    options: { timeoutMs: number; signal?: AbortSignal }
  ) {
    // Plain string paths, not path.join(): a join of an unknowable temporary directory with a
    // literal tail makes the output file tracer glob the repository for that tail.
    const workDirectory = await mkdtemp(`${tmpdir()}/vectorizer-run-`);
    try {
      const extension = page.mimeType === "image/webp" ? "webp" : "png";
      const input = `${workDirectory}/page.${extension}`;
      const base = `${workDirectory}/page`;
      await writeFile(input, page.bytes, { mode: 0o600 });
      const started = Date.now();
      // The programs run in the server's own working directory (the repository), where the
      // relative default directory resolves; every file they read or write is passed absolute.
      await runProcess(
        this.config.pythonPath,
        [`${this.config.directory}/floorplan_vectorize.py`, input, base, "--px-size"],
        { timeoutMs: options.timeoutMs, signal: options.signal }
      );
      await runProcess(
        this.config.pythonPath,
        [`${this.config.directory}/app_evidence.py`, `${base}.json`, `${base}.evidence.json`],
        { timeoutMs: Math.max(10_000, options.timeoutMs - (Date.now() - started)), signal: options.signal }
      );
      return parseFloorPlanVectorizerEvidence(
        JSON.parse(await readFile(`${base}.evidence.json`, "utf8"))
      );
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
}

export function createDefaultFloorPlanVectorizerProvider(): FloorPlanVectorizerProvider | null {
  const config = floorPlanVectorizerRuntimeConfiguration();
  return config.enabled ? new PythonFloorPlanVectorizerProvider(config) : null;
}
