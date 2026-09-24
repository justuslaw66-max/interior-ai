import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

// The Python programs are run from the repository, never bundled: the segments are joined at
// runtime so Next's output file tracer does not read this as a directory to copy into the
// standalone build (and next.config excludes services/ from tracing as well).
const VECTORIZER_DIRECTORY_SEGMENTS = ["services", "floorplan-vectorizer"];

function defaultVectorizerDirectory() {
  return path.resolve(process.cwd(), VECTORIZER_DIRECTORY_SEGMENTS.join(path.sep));
}

export function floorPlanVectorizerRuntimeConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  const timeout = Number.parseInt(environment.FLOOR_PLAN_VECTORIZER_TIMEOUT_MS ?? "", 10);
  return Object.freeze({
    enabled: environment.FLOOR_PLAN_VECTORIZER_ENABLED === "1",
    pythonPath: environment.FLOOR_PLAN_VECTORIZER_PYTHON || "python3",
    directory: environment.FLOOR_PLAN_VECTORIZER_DIR || defaultVectorizerDirectory(),
    timeoutMs: Number.isFinite(timeout) ? Math.max(10_000, Math.min(timeout, 900_000)) : 420_000,
  });
}

function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal }
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ["ignore", "ignore", "pipe"] });
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
    const workDirectory = await mkdtemp(path.join(tmpdir(), "floor-plan-vectorizer-"));
    try {
      const extension = page.mimeType === "image/webp" ? "webp" : "png";
      const input = path.join(workDirectory, `page.${extension}`);
      const base = path.join(workDirectory, "page");
      await writeFile(input, page.bytes, { mode: 0o600 });
      const started = Date.now();
      await runProcess(
        this.config.pythonPath,
        [path.join(this.config.directory, "floorplan_vectorize.py"), input, base, "--px-size"],
        { cwd: workDirectory, timeoutMs: options.timeoutMs, signal: options.signal }
      );
      await runProcess(
        this.config.pythonPath,
        [path.join(this.config.directory, "app_evidence.py"), `${base}.json`, `${base}.evidence.json`],
        {
          cwd: workDirectory,
          timeoutMs: Math.max(10_000, options.timeoutMs - (Date.now() - started)),
          signal: options.signal,
        }
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
