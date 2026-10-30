import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  parseFloorPlanVectorizerDrawing,
  parseFloorPlanVectorizerEvidence,
  type FloorPlanVectorizerEvidence,
} from "./vectorizer-evidence-schema";

/**
 * Process boundary for the local floor-plan vectorizer (services/floorplan-vectorizer).
 * Nothing leaves the machine: the page is written to a private temporary folder,
 * the two Python programs run there with a bounded timeout, and the folder is removed. With the faithful trace on
 * (FLOOR_PLAN_FAITHFUL_TRACE=1) a third program draws a clean page as it is drawn, in place of stage 1's drawing, and
 * on its own (`drawPage`) for a page stage 1 could not read.
 */

export type FloorPlanVectorizerPage = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  mimeType: string;
  bytes: Uint8Array;
};

type FaithfulDrawing = NonNullable<FloorPlanVectorizerEvidence["drawing"]>;

/** The faithful trace of a page, or why there is none ("Faithful trace not used: …" / "… unavailable: …"). */
export type FaithfulDrawingResult = { drawing: FaithfulDrawing } | { note: string };

/** Server-local boundary. Implementations must not upload page bytes. */
export interface FloorPlanVectorizerProvider {
  readonly id: string;
  /** True when pages are drawn by the faithful trace: a page's traced drawing is then the faithful trace or none. */
  readonly drawsFaithfully?: boolean;
  analyzePage(
    page: FloorPlanVectorizerPage,
    options: { timeoutMs: number; signal?: AbortSignal }
  ): Promise<FloorPlanVectorizerEvidence>;
  /** The faithful trace alone, for a page the vectorizer could not read (stage 1 failed or ran out of time). */
  drawPage?(page: FloorPlanVectorizerPage, options: { signal?: AbortSignal }): Promise<FaithfulDrawingResult>;
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
  const exportFloor = Number.parseInt(environment.FLOOR_PLAN_VECTORIZER_EXPORT_FLOOR_MS ?? "", 10);
  const faithfulTimeout = Number.parseInt(environment.FLOOR_PLAN_FAITHFUL_TRACE_TIMEOUT_MS ?? "", 10);
  const faithfulPixels = Number.parseInt(environment.FLOOR_PLAN_FAITHFUL_TRACE_MAX_PIXELS ?? "", 10);
  const faithfulMin = Number.parseInt(environment.FLOOR_PLAN_FAITHFUL_TRACE_MIN_MS ?? "", 10);
  return Object.freeze({
    enabled: environment.FLOOR_PLAN_VECTORIZER_ENABLED === "1",
    pythonPath: environment.FLOOR_PLAN_VECTORIZER_PYTHON || "python3",
    directory: environment.FLOOR_PLAN_VECTORIZER_DIR || DEFAULT_VECTORIZER_DIRECTORY,
    timeoutMs: Number.isFinite(timeout) ? Math.max(10_000, Math.min(timeout, 900_000)) : 420_000,
    // The exporter always gets at least this long, whatever the tracer left of the page's budget: a page
    // whose trace took the whole budget would otherwise lose its result in the last, short step.
    exportFloorMs: Number.isFinite(exportFloor) ? Math.max(10_000, Math.min(exportFloor, 300_000)) : 60_000,
    // The faithful trace of a clean page (faithful_drawing.py) as the page's drawing. Off unless set; it fails soft, with
    // its own time limit. It works at twice the picture's size up to this many pixels (about 400 MB per million), and at
    // the picture's own size up to three times as many (about 110 MB per million); a larger picture keeps stage 1's.
    faithfulTrace: environment.FLOOR_PLAN_FAITHFUL_TRACE === "1",
    faithfulTimeoutMs: Number.isFinite(faithfulTimeout) ? Math.max(10_000, Math.min(faithfulTimeout, 600_000)) : 240_000,
    faithfulMaxPixels: Number.isFinite(faithfulPixels) ? Math.max(100_000, Math.min(faithfulPixels, 16_000_000)) : 4_000_000,
    // No upload gives nothing (beta step 2.1, 30 Oct 2026): with the page budget on, the faithful trace runs inside the
    // page's own time limit (FLOOR_PLAN_VECTORIZER_TIMEOUT_MS) rather than after it. A page that reaches the trace with
    // less than this left comes back with stage 1's reading, noted, instead of waiting longer.
    pageBudget: environment.FLOOR_PLAN_VECTORIZER_PAGE_BUDGET === "1",
    faithfulMinMs: Number.isFinite(faithfulMin) ? Math.max(5_000, Math.min(faithfulMin, 300_000)) : 30_000,
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
  readonly drawsFaithfully: boolean;

  constructor(private readonly config = floorPlanVectorizerRuntimeConfiguration()) {
    this.drawsFaithfully = config.faithfulTrace;
  }

  async analyzePage(
    page: FloorPlanVectorizerPage,
    options: { timeoutMs: number; signal?: AbortSignal }
  ) {
    const workDirectory = await mkdtemp(`${tmpdir()}/vectorizer-run-`);
    try {
      const { input, base } = await writePage(workDirectory, page);
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
        {
          timeoutMs: Math.max(this.config.exportFloorMs, options.timeoutMs - (Date.now() - started)),
          signal: options.signal,
        }
      );
      const evidence = parseFloorPlanVectorizerEvidence(
        JSON.parse(await readFile(`${base}.evidence.json`, "utf8"))
      );
      if (!this.config.faithfulTrace) return evidence;
      if (!this.config.pageBudget) return await this.withFaithfulDrawing(evidence, input, base, options.signal);
      const leftMs = options.timeoutMs - (Date.now() - started);
      if (leftMs < this.config.faithfulMinMs) {
        return withNote(evidence, `Faithful trace not used: the page's time limit was nearly spent (${Math.round((Date.now() - started) / 1000)} s)`);
      }
      return await this.withFaithfulDrawing(evidence, input, base, options.signal, Math.min(this.config.faithfulTimeoutMs, leftMs));
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }

  /** With the faithful trace on, a page the vectorizer could not read is still drawn by it (J, 24 Oct: the older pixel
   * trace is not shown while the faithful trace is on). Its own time limit; cancelling the import cancels it. */
  async drawPage(page: FloorPlanVectorizerPage, options: { signal?: AbortSignal }): Promise<FaithfulDrawingResult> {
    if (!this.config.faithfulTrace) return { note: "Faithful trace not used: it is off" };
    const workDirectory = await mkdtemp(`${tmpdir()}/vectorizer-run-`);
    try {
      const { input, base } = await writePage(workDirectory, page);
      return await this.faithfulDrawing(input, base, options.signal);
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }

  /** The faithful trace of a clean page as its drawing (J, 22 Oct: "clean sharp vectors"). It fails soft: a picture
   * that is not crisp or is too large, a failure or a timeout leaves stage 1's drawing, and the notes say why. */
  private async withFaithfulDrawing(evidence: FloorPlanVectorizerEvidence, input: string, base: string, signal?: AbortSignal,
    timeoutMs = this.config.faithfulTimeoutMs) {
    const result = await this.faithfulDrawing(input, base, signal, timeoutMs);
    return "drawing" in result ? { ...evidence, drawing: result.drawing } : withNote(evidence, result.note);
  }

  /** Runs faithful_drawing.py on the page; a page it leaves, a failure or a timeout comes back as a note. Cancelling the
   * import still cancels it. */
  private async faithfulDrawing(input: string, base: string, signal?: AbortSignal,
    timeoutMs = this.config.faithfulTimeoutMs): Promise<FaithfulDrawingResult> {
    try {
      await runProcess(
        this.config.pythonPath,
        [`${this.config.directory}/faithful_drawing.py`, input, `${base}.faithful.json`, `--max-pixels=${this.config.faithfulMaxPixels}`],
        { timeoutMs, signal }
      );
      const result: unknown = JSON.parse(await readFile(`${base}.faithful.json`, "utf8"));
      if (result && typeof result === "object" && "skipped" in result) {
        return { note: `Faithful trace not used: ${String(result.skipped)}` };
      }
      return { drawing: parseFloorPlanVectorizerDrawing(result) };
    } catch (cause) {
      if (signal?.aborted) throw cause;
      return { note: `Faithful trace unavailable: ${cause instanceof Error ? cause.message : "unknown error"}` };
    }
  }
}

/** The page in a private folder, as the programs read it. Plain string paths, not path.join(): a join of an unknowable
 * temporary directory with a literal tail makes the output file tracer glob the repository for that tail. */
async function writePage(workDirectory: string, page: FloorPlanVectorizerPage) {
  const extension = page.mimeType === "image/webp" ? "webp" : "png";
  const input = `${workDirectory}/page.${extension}`;
  await writeFile(input, page.bytes, { mode: 0o600 });
  return { input, base: `${workDirectory}/page` };
}

function withNote(evidence: FloorPlanVectorizerEvidence, note: string): FloorPlanVectorizerEvidence {
  const notes = [...evidence.semantics.notes, note.slice(0, 240)].slice(0, 30);
  return { ...evidence, semantics: { ...evidence.semantics, notes } };
}

export function createDefaultFloorPlanVectorizerProvider(): FloorPlanVectorizerProvider | null {
  const config = floorPlanVectorizerRuntimeConfiguration();
  return config.enabled ? new PythonFloorPlanVectorizerProvider(config) : null;
}
