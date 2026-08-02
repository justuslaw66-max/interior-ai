import { createRequire } from "node:module";

export type FloorPlanLocalOcrCandidate = {
  text: string;
  confidence: number;
  bbox: { left: number; top: number; right: number; bottom: number };
};

export type FloorPlanLocalOcrPage = {
  pageNumber: number;
  widthPx: number;
  heightPx: number;
  mimeType: "image/png" | "image/webp";
  bytes: Uint8Array;
};

export type FloorPlanLocalOcrOptions = {
  timeoutMs: number;
  maxCandidates: number;
  minSourceConfidence: number;
  signal?: AbortSignal;
};

export type FloorPlanLocalOcrResult = {
  providerId: string;
  candidates: FloorPlanLocalOcrCandidate[];
  elapsedMs: number;
  truncated: boolean;
};

/** Server-local OCR boundary. Implementations must not upload page bytes. */
export interface FloorPlanLocalOcrProvider {
  readonly id: string;
  recognizePage(
    page: FloorPlanLocalOcrPage,
    options: FloorPlanLocalOcrOptions
  ): Promise<FloorPlanLocalOcrResult>;
}

type TesseractWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

type TesseractLine = {
  text: string;
  confidence: number;
  bbox: TesseractWord["bbox"];
  words: TesseractWord[];
};

type TesseractBlock = {
  paragraphs: Array<{ lines: TesseractLine[] }>;
};

function boundedInteger(
  value: number,
  fallback: number,
  minimum: number,
  maximum: number
) {
  return Number.isSafeInteger(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function cleanText(text: string) {
  return text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function validCandidate(
  candidate: FloorPlanLocalOcrCandidate,
  page: FloorPlanLocalOcrPage,
  minimumConfidence: number
) {
  const { left, top, right, bottom } = candidate.bbox;
  return (
    candidate.text.length > 0 &&
    candidate.confidence >= minimumConfidence &&
    [left, top, right, bottom].every(Number.isFinite) &&
    left >= 0 &&
    top >= 0 &&
    right > left &&
    bottom > top &&
    right <= page.widthPx + 1 &&
    bottom <= page.heightPx + 1
  );
}

function asCandidate(
  text: string,
  confidence: number,
  bbox: TesseractWord["bbox"]
): FloorPlanLocalOcrCandidate {
  return {
    text: cleanText(text),
    confidence: Math.max(0, Math.min(100, confidence)),
    bbox: { left: bbox.x0, top: bbox.y0, right: bbox.x1, bottom: bbox.y1 },
  };
}

function candidatesFromBlocks(
  blocks: TesseractBlock[] | null,
  page: FloorPlanLocalOcrPage,
  minimumConfidence: number,
  maximum: number
) {
  const candidates: FloorPlanLocalOcrCandidate[] = [];
  const keys = new Set<string>();
  const append = (candidate: FloorPlanLocalOcrCandidate) => {
    if (!validCandidate(candidate, page, minimumConfidence)) return;
    const key = `${candidate.text.toLowerCase()}:${Math.round(candidate.bbox.left)}:${Math.round(candidate.bbox.top)}:${Math.round(candidate.bbox.right)}:${Math.round(candidate.bbox.bottom)}`;
    if (keys.has(key)) return;
    keys.add(key);
    candidates.push(candidate);
  };
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        if (line.words?.length > 1) append(asCandidate(line.text, line.confidence, line.bbox));
        for (const word of line.words ?? []) append(asCandidate(word.text, word.confidence, word.bbox));
        if (candidates.length >= maximum) {
          return { candidates: candidates.slice(0, maximum), truncated: true };
        }
      }
    }
  }
  return { candidates, truncated: false };
}

export class TesseractFloorPlanLocalOcrProvider
  implements FloorPlanLocalOcrProvider
{
  readonly id = "tesseract-local-eng-v7";

  async recognizePage(
    page: FloorPlanLocalOcrPage,
    options: FloorPlanLocalOcrOptions
  ): Promise<FloorPlanLocalOcrResult> {
    if (options.signal?.aborted) throw new Error("LOCAL_OCR_ABORTED");
    const timeoutMs = boundedInteger(options.timeoutMs, 12_000, 1_000, 30_000);
    const maximum = boundedInteger(options.maxCandidates, 600, 1, 2_000);
    const minimumConfidence = Math.max(0, Math.min(100, options.minSourceConfidence));
    const require = createRequire(`${process.cwd()}/package.json`);
    const language = require("@tesseract.js-data/eng") as {
      code: string;
      gzip: boolean;
      langPath: string;
    };
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    const startedAt = Date.now();
    const workerPromise = createWorker(language.code, OEM.LSTM_ONLY, {
      // The packaged language data is mandatory: never fall back to a CDN.
      langPath: language.langPath,
      gzip: language.gzip,
      cacheMethod: "readOnly",
    });
    let worker: Awaited<typeof workerPromise> | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let rejectDeadline: ((reason: Error) => void) | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      rejectDeadline = reject;
      timeout = setTimeout(() => reject(new Error("LOCAL_OCR_TIMEOUT")), timeoutMs);
    });
    const terminateOnAbort = () => rejectDeadline?.(new Error("LOCAL_OCR_ABORTED"));
    options.signal?.addEventListener("abort", terminateOnAbort, { once: true });
    try {
      worker = await Promise.race([workerPromise, deadline]);
      await Promise.race([
        worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          preserve_interword_spaces: "1",
        }),
        deadline,
      ]);
      const recognized = await Promise.race([
        worker.recognize(
          Buffer.from(page.bytes),
          {},
          { text: true, blocks: true },
          `floor-plan-ocr-page-${page.pageNumber}`
        ),
        deadline,
      ]);
      if (options.signal?.aborted) throw new Error("LOCAL_OCR_ABORTED");
      const extracted = candidatesFromBlocks(
        recognized.data.blocks as TesseractBlock[] | null,
        page,
        minimumConfidence,
        maximum
      );
      return {
        providerId: this.id,
        candidates: extracted.candidates,
        elapsedMs: Date.now() - startedAt,
        truncated: extracted.truncated,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", terminateOnAbort);
      if (worker) {
        await worker.terminate("local-ocr-complete").catch(() => undefined);
      } else {
        void workerPromise
          .then((initialized) => initialized.terminate("local-ocr-late-cleanup"))
          .catch(() => undefined);
      }
    }
  }
}

export function createDefaultFloorPlanLocalOcrProvider(): FloorPlanLocalOcrProvider | null {
  return process.env.FLOOR_PLAN_LOCAL_OCR_DISABLED === "1"
    ? null
    : new TesseractFloorPlanLocalOcrProvider();
}
